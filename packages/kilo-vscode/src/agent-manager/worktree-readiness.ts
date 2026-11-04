/**
 * Worktree readiness: whether a project can hold worktrees, and the fixes when it can't.
 *
 * Entry-agnostic and VS Code-free. Callers pass a project root plus the few host
 * capabilities a step needs, so the New Worktree dialog and any other creation
 * path share one check.
 *
 * The check stops at the first problem, in this order: Git, repository, commits,
 * Git LFS. Git and Git LFS use the same caches creation uses, and a `fresh`
 * check bypasses both after an install or when the window regains focus.
 */

import * as fs from "node:fs/promises"
import * as path from "node:path"
import type { GitOps } from "./GitOps"
import { isRestrictedRoot } from "./home-workspace"
import { canonicalizePath, samePath } from "./project/paths"
import * as prepare from "./project/prepare"
import type {
  Readiness,
  ReadinessFix,
  ReadinessInstaller,
  ReadinessProject,
  FixReadinessRequest,
} from "../../webview-ui/src/types/messages/agent-manager"
import type { InstallOutcome, ToolKind, ToolProbe } from "./worktree-install"

type Git = Pick<GitOps, "execGit">

const LIMIT = 3
const UNTRUSTED = "Trust this VS Code window before Kilo changes the project."
const RESTRICTED = "Choose a project folder, not your home folder or a filesystem root."

function trust(deps: ReadinessDeps) {
  if (!deps.trusted()) throw new Error(UNTRUSTED)
}

function allow(dir: string | undefined) {
  if (isRestrictedRoot(dir)) throw new Error(RESTRICTED)
}

export interface ReadinessTools {
  git(fresh: boolean, verify?: boolean): Promise<ToolProbe>
  usesLfs(root: string): Promise<boolean>
  lfs(root: string, fresh: boolean, verify?: boolean): Promise<ToolProbe>
  installer(kind: ToolKind): Promise<ReadinessInstaller | undefined>
  install(kind: ToolKind, root: string): Promise<InstallOutcome>
  download(kind: ToolKind): void
}

export interface ReadinessDeps {
  git: Git
  trusted: () => boolean
  tools?: ReadinessTools
  /** Injected for platform-specific probes in tests. */
  platform?: NodeJS.Platform
}

export interface FixDeps extends ReadinessDeps {
  /** Write Kilo's entries to the project's `.git/info/exclude`. */
  exclude: () => Promise<void>
  /** Open the repository in VS Code's Source Control view. */
  openRepository: (root: string) => void
  /** Post the project's refreshed branch list. */
  branches: () => Promise<void>
  /** Register a folder as a project and resolve its project ID. */
  attach: (root: string) => Promise<string>
  /** Ask for a folder; undefined when cancelled. */
  pick: () => Promise<string | undefined>
}

export interface FixOutcome {
  result: Readiness
  /** Project a switch fix selected. */
  selected?: string
  error?: string
  /** What an install or download fix did. */
  install?: InstallOutcome
}

/** One check per folder at a time; concurrent callers share it. A fresh check always bypasses it. */
const flight = new Map<string, Promise<Readiness>>()

export function check(root: string, deps: ReadinessDeps, fresh = false, verify = false): Promise<Readiness> {
  if (fresh || verify) return probe(root, deps, fresh, verify)
  const key = canonicalizePath(root)
  const running = flight.get(key)
  if (running) return running
  const next = probe(root, deps, false, false).finally(() => flight.delete(key))
  flight.set(key, next)
  return next
}

/** Run one fix, then re-check (bypassing any check in flight) and report the new state. */
export async function fix(
  root: string,
  request: Pick<FixReadinessRequest, "fix" | "target" | "identity">,
  deps: FixDeps,
): Promise<FixOutcome> {
  const done = await apply(root, request, deps).then(
    (value) => value,
    (err: unknown) => ({
      error: err instanceof Error ? err.message : String(err),
      root,
      selected: undefined,
      note: false,
    }),
  )
  const result = await probe(done.root, deps, false)
  const outcome = {
    result:
      result.status === "ready" && done.note ? { status: "ready" as const, note: "uncommitted" as const } : result,
  }
  const install = "install" in done ? done.install : undefined
  if (install) return { ...outcome, install, ...("error" in done ? { error: done.error } : {}) }
  if ("error" in done) return { ...outcome, error: done.error }
  if (done.selected) return { ...outcome, selected: done.selected }
  return outcome
}

async function probe(root: string, deps: ReadinessDeps, fresh = false, verify = false): Promise<Readiness> {
  return inspect(root, deps, fresh, verify).catch((err: unknown) => ({
    status: "unknown" as const,
    detail: err instanceof Error ? err.message : String(err),
  }))
}

async function inspect(root: string, deps: ReadinessDeps, fresh: boolean, verify: boolean): Promise<Readiness> {
  if (deps.tools) {
    const git = await deps.tools.git(fresh, verify)
    if (!git.ok) return missing("git", git, root, deps)
  }
  // Repository and commits.
  const state = await prepare.inspect(root, deps.git)
  if (isRestrictedRoot(state.root ?? root)) {
    return {
      status: "blocked",
      code: "not_git_repo",
      name: path.basename(state.root ?? root),
      trusted: deps.trusted(),
      restricted: true,
    }
  }
  if (!state.root) return folder(root, deps)
  if (state.empty) {
    return {
      status: "blocked",
      code: "no_commits",
      name: path.basename(state.root),
      trusted: deps.trusted(),
      identity: await prepare.identity(state.root, deps.git),
    }
  }
  if (deps.tools && (await deps.tools.usesLfs(state.root))) {
    const lfs = await deps.tools.lfs(state.root, fresh, verify)
    if (!lfs.ok) return missing("lfs", lfs, state.root, deps)
  }
  return { status: "ready" }
}

/** A confirmed missing tool becomes a blocker; any other probe failure stays advisory. */
async function missing(
  kind: ToolKind,
  probe: Extract<ToolProbe, { ok: false }>,
  root: string,
  deps: ReadinessDeps,
): Promise<Readiness> {
  if (probe.code === "unknown") return { status: "unknown", detail: probe.detail }
  return {
    status: "blocked",
    code: kind === "git" ? "git_not_found" : "lfs_missing",
    name: path.basename(root),
    trusted: deps.trusted(),
    platform: deps.platform ?? process.platform,
    installer: await deps.tools?.installer(kind),
  }
}

/** A folder that is not a Git project: offer the projects inside it, or setting up Git. */
async function folder(root: string, deps: ReadinessDeps): Promise<Readiness> {
  const base = { status: "blocked" as const, code: "not_git_repo" as const, name: path.basename(root) }
  const found = await children(root)
  if (found.length > 0) {
    return {
      ...base,
      trusted: deps.trusted(),
      projects: found.slice(0, LIMIT),
      ...(found.length > LIMIT ? { more: true } : {}),
    }
  }
  return { ...base, trusted: deps.trusted(), identity: await prepare.identity(root, deps.git) }
}

/** Direct child folders that contain `.git`, one level deep, stopping after one more than shown. */
async function children(root: string): Promise<ReadinessProject[]> {
  const entries = await fs.readdir(root, { withFileTypes: true })
  const found: ReadinessProject[] = []
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (found.length > LIMIT) break
    if (!entry.isDirectory()) continue
    const dir = path.join(root, entry.name)
    if (await exists(path.join(dir, ".git"))) found.push({ root: dir, label: entry.name })
  }
  return found
}

function exists(file: string) {
  return fs.access(file).then(
    () => true,
    () => false,
  )
}

async function apply(
  root: string,
  request: Pick<FixReadinessRequest, "fix" | "target" | "identity">,
  deps: FixDeps,
): Promise<{ root: string; selected?: string; note: boolean; install?: InstallOutcome }> {
  const quick = await external(root, request, deps)
  if (quick) return quick
  trust(deps)
  if (request.fix === "useProject") {
    const target = request.target ? canonicalizePath(request.target) : ""
    if (!target || !samePath(path.dirname(target), root) || !(await exists(path.join(target, ".git"))))
      throw new Error(`Not a Git project inside ${root}: ${request.target ?? ""}`)
    return select(target, deps)
  }
  if (request.fix === "pickFolder") {
    const dir = await deps.pick()
    if (!dir) return { root, note: false }
    return select(dir, deps)
  }
  const state = await prepare.inspect(root, deps.git)
  allow(state.root ?? root)
  if (request.fix === "initialCommit" && !state.root) throw new Error(`Not a Git repository: ${root}`)
  if (!request.identity && !(await prepare.identity(root, deps.git)))
    throw new Error("Git needs a name and email before Kilo can create the first commit.")
  trust(deps)
  const repo = state.root ?? (await prepare.initialize(root, deps.git))
  trust(deps)
  await deps.exclude()
  trust(deps)
  if (request.identity) await prepare.configure(repo, deps.git, request.identity)
  trust(deps)
  await prepare.commit(repo, deps.git)
  deps.openRepository(repo)
  await deps.branches()
  const status = await deps.git.execGit(["-c", "core.fsmonitor=false", "status", "--porcelain"], repo)
  return { root, note: status.code === 0 && status.stdout.trim().length > 0 }
}

/** Downloads and installs need no repository inspection. */
async function external(
  root: string,
  request: Pick<FixReadinessRequest, "fix">,
  deps: FixDeps,
): Promise<{ root: string; note: boolean; install?: InstallOutcome } | undefined> {
  if (request.fix !== "downloadGit" && request.fix !== "downloadLfs") {
    if (request.fix !== "installGit" && request.fix !== "installLfs") return undefined
    trust(deps)
    if (!deps.tools) throw new Error("Installing tools is unavailable.")
    const kind = request.fix === "installGit" ? "git" : "lfs"
    return { root, note: false, install: await deps.tools.install(kind, root) }
  }
  if (!deps.tools) throw new Error("Opening the download page is unavailable.")
  deps.tools.download(request.fix === "downloadGit" ? "git" : "lfs")
  return { root, note: false }
}

/** Register a folder's project and select it. */
async function select(dir: string, deps: FixDeps): Promise<{ root: string; selected: string; note: boolean }> {
  const state = await prepare.inspect(dir, deps.git)
  const root = state.root ?? canonicalizePath(dir)
  allow(root)
  trust(deps)
  return { root, selected: await deps.attach(root), note: false }
}

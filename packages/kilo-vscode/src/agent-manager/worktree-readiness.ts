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
import { errorText } from "./git-errors"
import { toolEnvironment } from "./shell-env"
import type {
  Readiness,
  ReadinessInstaller,
  ReadinessMessage,
  ReadinessProject,
  FixReadinessRequest,
} from "../../webview-ui/src/types/messages/agent-manager"
import { codeForTool, isDownload, isInstall, toolFor } from "../shared/worktree-readiness"
import type { InstallOutcome, Tool, ToolProbe } from "./worktree-install"

type Git = Pick<GitOps, "execGit">

const MAX_PROJECT_CHOICES = 3
const UNTRUSTED = "Trust this VS Code window before Kilo changes the project."
const RESTRICTED = "Choose a project folder, not your home folder or a filesystem root."

function ensureTrusted(deps: ReadinessDeps) {
  if (!deps.trusted()) throw new Error(UNTRUSTED)
}

function ensureAllowed(dir: string | undefined) {
  if (isRestrictedRoot(dir)) throw new Error(RESTRICTED)
}

export interface ReadinessTools {
  git(fresh: boolean, verify?: boolean, env?: NodeJS.ProcessEnv): Promise<ToolProbe>
  usesLfs(root: string): Promise<boolean>
  lfs(root: string, fresh: boolean, verify?: boolean, env?: NodeJS.ProcessEnv): Promise<ToolProbe>
  /** Whether git-lfs filters are registered (global config). */
  lfsSetup(root: string): Promise<boolean>
  /** Run `git lfs install` for a repo whose filters are not registered. */
  setupLfs(root: string): Promise<number | undefined>
  installer(kind: Tool): Promise<ReadinessInstaller | undefined>
  install(kind: Tool, root: string): Promise<InstallOutcome>
  download(kind: Tool): void
}

export interface ReadinessDeps {
  git: Git
  trusted: () => boolean
  tools: ReadinessTools
  /** Injected for platform-specific probes in tests. */
  platform?: NodeJS.Platform
}

export interface FixDeps extends ReadinessDeps {
  exclude: () => Promise<void>
  openRepository: (root: string) => void
  branches: () => Promise<void>
  attach: (root: string) => Promise<string>
  pick: () => Promise<string | undefined>
}

export type FixOutcome = Omit<ReadinessMessage, "type" | "projectId" | "requestID">

/** One check per folder at a time; concurrent callers share it. A fresh check always bypasses it. */
const flight = new Map<string, Promise<Readiness>>()

export function checkWorktreeReadiness(
  root: string,
  deps: ReadinessDeps,
  fresh = false,
  verify = false,
): Promise<Readiness> {
  if (fresh || verify) return readReadiness(root, deps, fresh, verify)
  const key = canonicalizePath(root)
  const running = flight.get(key)
  if (running) return running
  const next = readReadiness(root, deps, false, false).finally(() => flight.delete(key))
  flight.set(key, next)
  return next
}

/** Run one fix, then re-check (bypassing any check in flight) and report the new state. */
export async function applyWorktreeFix(
  root: string,
  request: Pick<FixReadinessRequest, "fix" | "target" | "identity">,
  deps: FixDeps,
): Promise<FixOutcome> {
  const applied: FixResult = await runFix(root, request, deps).catch((err: unknown) => ({
    root,
    error: errorText(err),
  }))
  // A fresh check makes an install visible immediately; only a truly invisible tool stays stale.
  const result = await readReadiness(applied.root, deps, applied.install !== undefined)
  return {
    result: result.status === "ready" && applied.note ? { status: "ready", note: "uncommitted" } : result,
    ...(applied.selected ? { selected: applied.selected } : {}),
    ...(applied.error ? { error: applied.error } : {}),
    ...(applied.install ? { install: applied.install } : {}),
  }
}

type FixResult = { root: string; selected?: string; note?: boolean; install?: InstallOutcome; error?: string }

async function readReadiness(root: string, deps: ReadinessDeps, fresh = false, verify = false): Promise<Readiness> {
  return inspectProject(root, deps, fresh, verify).catch((err: unknown) => ({
    status: "unknown" as const,
    detail: errorText(err),
  }))
}

async function inspectProject(root: string, deps: ReadinessDeps, fresh: boolean, verify: boolean): Promise<Readiness> {
  const env = fresh ? await toolEnvironment(true) : undefined
  const git = await deps.tools.git(fresh, verify, env)
  if (!git.ok) return blockedTool("git", git, root, deps)
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
  if (!state.root) return projectChoices(root, deps)
  if (state.empty) {
    return {
      status: "blocked",
      code: "no_commits",
      name: path.basename(state.root),
      trusted: deps.trusted(),
      identity: await prepare.identity(state.root, deps.git),
    }
  }
  if (await deps.tools.usesLfs(state.root)) {
    const lfs = await deps.tools.lfs(state.root, fresh, verify, env)
    if (!lfs.ok) return blockedTool("lfs", lfs, state.root, deps)
    if (!(await deps.tools.lfsSetup(state.root)))
      return {
        status: "blocked",
        code: "lfs_not_setup",
        name: path.basename(state.root),
        trusted: deps.trusted(),
      }
  }
  return { status: "ready" }
}

/** A confirmed missing tool becomes a blocker; any other probe failure stays advisory. */
async function blockedTool(
  kind: Tool,
  failure: Extract<ToolProbe, { ok: false }>,
  root: string,
  deps: ReadinessDeps,
): Promise<Readiness> {
  if (failure.code === "unknown") return { status: "unknown", detail: failure.detail }
  return {
    status: "blocked",
    code: kind === "git" ? "git_not_found" : "lfs_missing",
    name: path.basename(root),
    trusted: deps.trusted(),
    platform: deps.platform ?? process.platform,
    installer: await deps.tools.installer(kind),
  }
}

/** A folder that is not a Git project: offer the projects inside it, or setting up Git. */
async function projectChoices(root: string, deps: ReadinessDeps): Promise<Readiness> {
  const base = { status: "blocked" as const, code: "not_git_repo" as const, name: path.basename(root) }
  const found = await childProjects(root)
  if (found.length > 0) {
    return {
      ...base,
      trusted: deps.trusted(),
      projects: found.slice(0, MAX_PROJECT_CHOICES),
      ...(found.length > MAX_PROJECT_CHOICES ? { more: true } : {}),
    }
  }
  return { ...base, trusted: deps.trusted(), identity: await prepare.identity(root, deps.git) }
}

/** Direct child folders that contain `.git`, one level deep, stopping after one more than shown. */
async function childProjects(root: string): Promise<ReadinessProject[]> {
  const entries = await fs.readdir(root, { withFileTypes: true })
  const found: ReadinessProject[] = []
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (found.length > MAX_PROJECT_CHOICES) break
    if (!entry.isDirectory()) continue
    const dir = path.join(root, entry.name)
    if (await fileExists(path.join(dir, ".git"))) found.push({ root: dir, label: entry.name })
  }
  return found
}

function fileExists(file: string) {
  return fs.access(file).then(
    () => true,
    () => false,
  )
}

async function runFix(
  root: string,
  request: Pick<FixReadinessRequest, "fix" | "target" | "identity">,
  deps: FixDeps,
): Promise<FixResult> {
  const toolFix = await runToolFix(root, request, deps)
  if (toolFix) return toolFix
  ensureTrusted(deps)
  if (request.fix === "useProject") {
    const target = request.target ? canonicalizePath(request.target) : ""
    if (!target || !samePath(path.dirname(target), root) || !(await fileExists(path.join(target, ".git"))))
      throw new Error(`Not a Git project inside ${root}: ${request.target ?? ""}`)
    return registerProject(target, deps)
  }
  if (request.fix === "pickFolder") {
    const dir = await deps.pick()
    if (!dir) return { root }
    return registerProject(dir, deps)
  }
  const state = await prepare.inspect(root, deps.git)
  ensureAllowed(state.root ?? root)
  if (request.fix === "initialCommit" && !state.root) throw new Error(`Not a Git repository: ${root}`)
  if (!request.identity && !(await prepare.identity(root, deps.git)))
    throw new Error("Git needs a name and email before Kilo can create the first commit.")
  ensureTrusted(deps)
  const repo = state.root ?? (await prepare.initialize(root, deps.git))
  ensureTrusted(deps)
  await deps.exclude()
  ensureTrusted(deps)
  if (request.identity) await prepare.configure(repo, deps.git, request.identity)
  ensureTrusted(deps)
  await prepare.commit(repo, deps.git)
  deps.openRepository(repo)
  await deps.branches()
  const status = await deps.git.execGit(["-c", "core.fsmonitor=false", "status", "--porcelain"], repo)
  return { root, note: status.code === 0 && status.stdout.trim().length > 0 }
}

/** Downloads and installs need no repository inspection. */
async function runToolFix(
  root: string,
  request: Pick<FixReadinessRequest, "fix">,
  deps: FixDeps,
): Promise<FixResult | undefined> {
  if (request.fix === "setupLfs") {
    ensureTrusted(deps)
    await deps.tools.setupLfs(root)
    return { root }
  }
  const tool = toolFor(request.fix)
  if (!tool) return undefined
  if (isDownload(request.fix)) {
    deps.tools.download(tool)
    return { root }
  }
  ensureTrusted(deps)
  return { root, install: await deps.tools.install(tool, root) }
}

async function registerProject(dir: string, deps: FixDeps): Promise<FixResult> {
  const state = await prepare.inspect(dir, deps.git)
  const root = state.root ?? canonicalizePath(dir)
  ensureAllowed(root)
  ensureTrusted(deps)
  return { root, selected: await deps.attach(root) }
}

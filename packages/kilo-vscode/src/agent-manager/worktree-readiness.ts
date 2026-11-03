/**
 * Worktree readiness: whether a project can hold worktrees, and the fixes when it can't.
 *
 * Entry-agnostic and VS Code-free. Callers pass a project root plus the few host
 * capabilities a step needs, so the New Worktree dialog and any other creation
 * path share one check.
 *
 * The check stops at the first problem, in this order: Git, repository, commits,
 * Git LFS. The repository and commit steps live here; Git and Git LFS are not
 * checked yet, so a missing Git surfaces as `unknown` and never blocks.
 */

import * as fs from "node:fs/promises"
import * as path from "node:path"
import type { GitOps } from "./GitOps"
import { isRestrictedRoot } from "./home-workspace"
import { canonicalizePath, samePath } from "./project/paths"
import * as prepare from "./project/prepare"
import type {
  Readiness,
  ReadinessProject,
  FixReadinessRequest,
} from "../../webview-ui/src/types/messages/agent-manager"

type Git = Pick<GitOps, "execGit">

const LIMIT = 3
const UNTRUSTED = "Trust this VS Code window before Kilo changes the project."
const RESTRICTED = "Choose a project folder, not your home folder or a filesystem root."

export interface ReadinessDeps {
  git: Git
  trusted: () => boolean
}

export interface FixDeps extends ReadinessDeps {
  /** Write Kilo's entries to the project's `.git/info/exclude`. */
  exclude: () => Promise<void>
  /** Refresh VS Code's Source Control view. */
  refresh: () => void
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
}

/** One check per folder at a time; concurrent callers share it. */
const flight = new Map<string, Promise<Readiness>>()

export function check(root: string, deps: ReadinessDeps): Promise<Readiness> {
  const key = canonicalizePath(root)
  const running = flight.get(key)
  if (running) return running
  const next = probe(root, deps).finally(() => flight.delete(key))
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
  const result = await probe(done.root, deps)
  const outcome = {
    result:
      result.status === "ready" && done.note ? { status: "ready" as const, note: "uncommitted" as const } : result,
  }
  if ("error" in done) return { ...outcome, error: done.error }
  if (done.selected) return { ...outcome, selected: done.selected }
  return outcome
}

async function probe(root: string, deps: ReadinessDeps): Promise<Readiness> {
  return inspect(root, deps).catch((err: unknown) => ({
    status: "unknown" as const,
    detail: err instanceof Error ? err.message : String(err),
  }))
}

async function inspect(root: string, deps: ReadinessDeps): Promise<Readiness> {
  // Git: not checked yet.
  // Repository and commits.
  const state = await prepare.inspect(root, deps.git)
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
  // Git LFS: not checked yet.
  return { status: "ready" }
}

/** A folder that is not a Git project: offer the projects inside it, or setting up Git. */
async function folder(root: string, deps: ReadinessDeps): Promise<Readiness> {
  const base = { status: "blocked" as const, code: "not_git_repo" as const, name: path.basename(root) }
  if (isRestrictedRoot(root)) return { ...base, trusted: deps.trusted(), restricted: true }
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
): Promise<{ root: string; selected?: string; note: boolean }> {
  if (!deps.trusted()) throw new Error(UNTRUSTED)
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
  if (isRestrictedRoot(root)) throw new Error(RESTRICTED)
  const state = await prepare.inspect(root, deps.git)
  if (request.fix === "initialCommit" && !state.root) throw new Error(`Not a Git repository: ${root}`)
  if (!request.identity && !(await prepare.identity(root, deps.git)))
    throw new Error("Git needs a name and email before Kilo can create the first commit.")
  const repo = state.root ?? (await prepare.initialize(root, deps.git))
  await deps.exclude()
  if (request.identity) await prepare.configure(repo, deps.git, request.identity)
  if (!deps.trusted()) throw new Error(UNTRUSTED)
  await prepare.commit(repo, deps.git)
  deps.refresh()
  await deps.branches()
  const status = await deps.git.execGit(["status", "--porcelain"], repo)
  return { root, note: status.code === 0 && status.stdout.trim().length > 0 }
}

/** Register a folder's project and select it. */
async function select(dir: string, deps: FixDeps): Promise<{ root: string; selected: string; note: boolean }> {
  const state = await prepare.inspect(dir, deps.git)
  const root = state.root ?? canonicalizePath(dir)
  if (isRestrictedRoot(root)) throw new Error(RESTRICTED)
  return { root, selected: await deps.attach(root), note: false }
}

/**
 * Fixed install recipes for Git and Git LFS.
 *
 * VS Code-free: the host supplies the task runner, URL opener, and probe
 * callbacks. Executables are resolved from PATH in the explicit environment so
 * local scenario fakes can never fall through to a real installer.
 */

import { tmpdir } from "node:os"
import { lookup } from "./path-lookup"

export type ToolKind = "git" | "lfs"
export type ToolProbe = { ok: true } | { ok: false; code: "missing" | "unknown"; detail: string }
export type Installer = "apple" | "brew" | "winget" | "apt" | "dnf"

export interface InstallCommand {
  command: string
  args: string[]
  cwd: string
  env: Record<string, string>
  mode: "task" | "launcher"
}

export interface InstallOutcome {
  kind: ToolKind
  mode: "apple" | "terminal" | "external"
  /** The installer succeeded, or the tool became available regardless of its exit code. */
  ok: boolean
  /** A launch error, kept raw for Show details. */
  error?: string
  /** Exit code when the install task ran and the tool is still missing. */
  code?: number
  /** The install task was stopped without an exit code. */
  stopped?: boolean
}

export interface InstallDeps {
  platform: NodeJS.Platform
  env: NodeJS.ProcessEnv
  /** The Git executable worktree creation uses, for `git lfs install`. */
  git: string
  run: (name: string, command: InstallCommand) => Promise<number | undefined>
  open: (url: string) => void
  probe: (kind: ToolKind, fresh: boolean) => Promise<ToolProbe>
}

export const DOWNLOAD = {
  git: "https://git-scm.com/downloads",
  lfs: "https://git-lfs.com",
}

interface Manager {
  id: Installer
  bin: string
  git: string[]
  lfs: string[]
  sudo: boolean
}

/** Small allowlist, in the order each platform should try. */
const MANAGERS: Manager[] = [
  { id: "brew", bin: "brew", git: ["install", "git"], lfs: ["install", "git-lfs"], sudo: false },
  {
    id: "winget",
    bin: "winget",
    git: ["install", "-e", "--id", "Git.Git"],
    lfs: ["install", "-e", "--id", "GitHub.GitLFS"],
    sudo: false,
  },
  { id: "apt", bin: "apt-get", git: ["install", "-y", "git"], lfs: ["install", "-y", "git-lfs"], sudo: true },
  { id: "dnf", bin: "dnf", git: ["install", "-y", "git"], lfs: ["install", "-y", "git-lfs"], sudo: true },
]

function order(platform: NodeJS.Platform): Installer[] {
  if (platform === "darwin") return ["brew"]
  if (platform === "win32") return ["winget"]
  return ["apt", "dnf"]
}

export async function detectInstaller(
  kind: ToolKind,
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
): Promise<Installer | undefined> {
  if (platform === "darwin" && kind === "git") {
    return (await lookup("xcode-select", env, platform)) ? "apple" : undefined
  }
  for (const id of order(platform)) {
    const manager = MANAGERS.find((item) => item.id === id)
    if (manager && (await lookup(manager.bin, env, platform))) return id
  }
  return undefined
}

function strings(env: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === "string") out[key] = value
  }
  return out
}

function recipe(manager: Manager, kind: ToolKind, root: string, env: NodeJS.ProcessEnv): InstallCommand {
  const args = kind === "git" ? manager.git : manager.lfs
  if (manager.sudo) {
    return { command: "sudo", args: [manager.bin, ...args], cwd: root, env: strings(env), mode: "task" }
  }
  return { command: manager.bin, args, cwd: root, env: strings(env), mode: "task" }
}

function message(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

/** A terminal install that ran (or stopped) without making the tool available. */
function failed(kind: ToolKind, failure: number | undefined): InstallOutcome {
  if (failure === undefined) return { kind, mode: "terminal", ok: false, stopped: true }
  return { kind, mode: "terminal", ok: false, code: failure }
}

/** Best-effort git-lfs registration after the package is installed. Availability still wins. */
async function configureLfs(deps: InstallDeps): Promise<InstallOutcome> {
  const command: InstallCommand = {
    command: deps.git,
    args: ["lfs", "install"],
    // Global registration works outside the repository; a repo alias must not hijack it.
    cwd: tmpdir(),
    env: strings(deps.env),
    mode: "task",
  }
  const failure = await deps.run("Set up Git LFS", command).catch(message)
  if (typeof failure === "string") {
    const available = (await deps.probe("lfs", true)).ok
    return available
      ? { kind: "lfs", mode: "terminal", ok: true }
      : { kind: "lfs", mode: "terminal", ok: false, error: failure }
  }
  const available = (await deps.probe("lfs", true)).ok
  if (available || failure === 0) return { kind: "lfs", mode: "terminal", ok: true }
  return failed("lfs", failure)
}

export async function installTool(kind: ToolKind, root: string, deps: InstallDeps): Promise<InstallOutcome> {
  const installer = await detectInstaller(kind, deps.platform, deps.env)
  if (!installer) {
    deps.open(DOWNLOAD[kind])
    return { kind, mode: "external", ok: false }
  }

  if (installer === "apple") {
    const command: InstallCommand = {
      command: "xcode-select",
      args: ["--install"],
      cwd: root,
      env: strings(deps.env),
      mode: "launcher",
    }
    const failure = await deps.run("Install Git", command).catch(message)
    if (typeof failure === "string") return { kind, mode: "apple", ok: false, error: failure }
    const available = (await deps.probe("git", false)).ok
    const ok = failure === 0 || available
    return {
      kind,
      mode: "apple",
      ok,
      ...(ok ? {} : { error: `xcode-select exited with code ${failure}` }),
    }
  }

  const manager = MANAGERS.find((item) => item.id === installer)
  if (!manager) return { kind, mode: "external", ok: false }
  const failure = await deps
    .run(kind === "git" ? "Install Git" : "Install Git LFS", recipe(manager, kind, root, deps.env))
    .catch(message)
  if (kind === "git") {
    if (typeof failure === "string") {
      const available = (await deps.probe("git", true)).ok
      return available ? { kind, mode: "terminal", ok: true } : { kind, mode: "terminal", ok: false, error: failure }
    }
    const available = (await deps.probe("git", true)).ok
    if (failure === 0 || available) return { kind, mode: "terminal", ok: true }
    return failed(kind, failure)
  }

  if (typeof failure === "string") {
    const available = (await deps.probe("lfs", true)).ok
    return available ? await configureLfs(deps) : { kind, mode: "terminal", ok: false, error: failure }
  }
  const available = (await deps.probe("lfs", true)).ok
  if (!available) return failed(kind, failure)
  return await configureLfs(deps)
}

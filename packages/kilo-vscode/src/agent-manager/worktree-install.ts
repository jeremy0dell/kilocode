/**
 * Fixed install recipes for Git and Git LFS.
 *
 * VS Code-free: the host supplies the task runner, URL opener, and probe
 * callbacks. Executables are resolved from PATH in the explicit environment so
 * local scenario fakes can never fall through to a real installer.
 */

import { constants } from "node:fs"
import * as fs from "node:fs/promises"
import * as path from "node:path"

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
  error?: string
}

export interface InstallDeps {
  platform: NodeJS.Platform
  env: NodeJS.ProcessEnv
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

function executable(name: string, env: NodeJS.ProcessEnv, platform: NodeJS.Platform): Promise<string | undefined> {
  const dirs = (env.PATH ?? "").split(path.delimiter).filter(Boolean)
  const exts = platform === "win32" ? (env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";") : [""]
  const mode = platform === "win32" ? constants.F_OK : constants.X_OK
  const next = (index: number, ext: number): Promise<string | undefined> => {
    const dir = dirs[index]
    const suffix = exts[ext]
    if (dir === undefined) return Promise.resolve(undefined)
    if (suffix === undefined) return next(index + 1, 0)
    const file = path.join(dir, `${name}${suffix}`)
    return fs.access(file, mode).then(
      () => file,
      () => next(index, ext + 1),
    )
  }
  return next(0, 0)
}

export async function detectInstaller(
  kind: ToolKind,
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
): Promise<Installer | undefined> {
  if (platform === "darwin" && kind === "git") {
    return (await executable("xcode-select", env, platform)) ? "apple" : undefined
  }
  for (const id of order(platform)) {
    const manager = MANAGERS.find((item) => item.id === id)
    if (manager && (await executable(manager.bin, env, platform))) return id
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

/** Best-effort git-lfs registration after the package is installed. Availability still wins. */
async function configureLfs(root: string, deps: InstallDeps): Promise<InstallOutcome> {
  const command: InstallCommand = {
    command: "git",
    args: ["lfs", "install"],
    cwd: root,
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
  return { kind: "lfs", mode: "terminal", ok: failure === 0 || available }
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
    return { kind, mode: "terminal", ok: failure === 0 || available }
  }

  if (typeof failure === "string") {
    const available = (await deps.probe("lfs", true)).ok
    return available ? await configureLfs(root, deps) : { kind, mode: "terminal", ok: false, error: failure }
  }
  const available = (await deps.probe("lfs", true)).ok
  if (!available) return { kind, mode: "terminal", ok: failure === 0 }
  return await configureLfs(root, deps)
}

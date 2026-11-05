/**
 * Fixed install recipes for Git and Git LFS.
 *
 * VS Code-free: the host supplies the task runner, URL opener, and probe
 * callbacks. Executables are resolved from PATH in the explicit environment so
 * local scenario fakes can never fall through to a real installer.
 */

import { tmpdir } from "node:os"
import { lookup } from "./path-lookup"
import { errorText } from "./git-errors"
import type {
  ReadinessInstall as InstallOutcome,
  ReadinessInstaller,
  Tool as ToolKind,
} from "../../webview-ui/src/types/messages/agent-manager"

export type { ReadinessInstall as InstallOutcome } from "../../webview-ui/src/types/messages/agent-manager"
export type { Tool as ToolKind } from "../../webview-ui/src/types/messages/agent-manager"
export type ToolProbe = { ok: true } | { ok: false; code: "missing" | "unknown"; detail: string }
type Installer = ReadinessInstaller

export interface InstallCommand {
  command: string
  args: string[]
  cwd: string
  env: Record<string, string>
  mode: "task" | "launcher"
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

/** Small allowlist; `sudo` managers run through sudo in the visible task. */
const MANAGERS = {
  brew: { bin: "brew", sudo: false, git: ["install", "git"], lfs: ["install", "git-lfs"] },
  winget: {
    bin: "winget",
    sudo: false,
    git: ["install", "-e", "--id", "Git.Git"],
    lfs: ["install", "-e", "--id", "GitHub.GitLFS"],
  },
  apt: { bin: "apt-get", sudo: true, git: ["install", "-y", "git"], lfs: ["install", "-y", "git-lfs"] },
  dnf: { bin: "dnf", sudo: true, git: ["install", "-y", "git"], lfs: ["install", "-y", "git-lfs"] },
} satisfies Record<Exclude<Installer, "apple">, { bin: string; sudo: boolean } & Record<ToolKind, string[]>>

/** Managers in the order each platform should try them. */
function order(platform: NodeJS.Platform): (keyof typeof MANAGERS)[] {
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
    if (await lookup(MANAGERS[id].bin, env, platform)) return id
  }
  return undefined
}

/**
 * Run one terminal step. Availability afterwards wins; otherwise keep the launch error,
 * exit code, or stopped state. A clean exit also counts when the installer says so.
 */
async function runInstallStep(
  deps: InstallDeps,
  kind: ToolKind,
  label: string,
  command: InstallCommand,
  cleanExitIsSuccess: boolean,
) {
  const exit = await deps.run(label, command).catch((err: unknown) => errorText(err))
  const present = (await deps.probe(kind, true)).ok
  const ok = present || (cleanExitIsSuccess && exit === 0)
  if (ok) return { outcome: { kind, mode: "terminal" as const, ok }, present }
  if (typeof exit === "string") return { outcome: { kind, mode: "terminal" as const, ok, error: exit }, present }
  if (exit === undefined) return { outcome: { kind, mode: "terminal" as const, ok, stopped: true }, present }
  return { outcome: { kind, mode: "terminal" as const, ok, code: exit }, present }
}

function stringEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  )
}

async function launchAppleInstaller(
  kind: ToolKind,
  root: string,
  env: Record<string, string>,
  deps: InstallDeps,
): Promise<InstallOutcome> {
  const command: InstallCommand = { command: "xcode-select", args: ["--install"], cwd: root, env, mode: "launcher" }
  const exit = await deps.run("Install Git", command).catch((err: unknown) => errorText(err))
  if (typeof exit === "string") return { kind, mode: "apple", ok: false, error: exit }
  const ok = exit === 0 || (await deps.probe("git", false)).ok
  if (ok) return { kind, mode: "apple", ok }
  return { kind, mode: "apple", ok, error: `xcode-select exited with code ${exit}` }
}

async function installWithManager(
  kind: ToolKind,
  installer: Exclude<Installer, "apple">,
  root: string,
  env: Record<string, string>,
  deps: InstallDeps,
): Promise<InstallOutcome> {
  const manager = MANAGERS[installer]
  const args = manager.sudo ? [manager.bin, ...manager[kind]] : manager[kind]
  const command = manager.sudo ? "sudo" : manager.bin
  const label = kind === "git" ? "Install Git" : "Install Git LFS"
  // A clean package exit means the installer succeeded even if VS Code cannot see the tool yet.
  const installed = await runInstallStep(deps, kind, label, { command, args, cwd: root, env, mode: "task" }, true)
  if (kind === "git" || !installed.outcome.ok) return installed.outcome
  if (!installed.present) return installed.outcome
  // Best-effort registration once the package is visible. Global registration works outside the
  // repository, so a repo alias must not hijack it.
  const lfs: InstallCommand = { command: deps.git, args: ["lfs", "install"], cwd: tmpdir(), env, mode: "task" }
  return (await runInstallStep(deps, "lfs", "Set up Git LFS", lfs, true)).outcome
}

export async function installTool(kind: ToolKind, root: string, deps: InstallDeps): Promise<InstallOutcome> {
  const installer = await detectInstaller(kind, deps.platform, deps.env)
  if (!installer) {
    deps.open(DOWNLOAD[kind])
    return { kind, mode: "external", ok: false }
  }
  const env = stringEnv(deps.env)
  if (installer === "apple") return await launchAppleInstaller(kind, root, env, deps)
  return await installWithManager(kind, installer, root, env, deps)
}

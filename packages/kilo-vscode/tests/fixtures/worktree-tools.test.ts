import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import os from "node:os"
import path from "node:path"
import fs from "node:fs/promises"
import { WorktreeManager } from "../../src/agent-manager/WorktreeManager"
import { clearShellEnvCache } from "../../src/agent-manager/shell-env"
import { type ToolProbe } from "../../src/agent-manager/worktree-install"

const dirs: string[] = []
let state = ""
let log = ""
const initial = { PATH: process.env.PATH, SHELL: process.env.SHELL }

beforeEach(async () => {
  process.env.PATH = initial.PATH
  process.env.SHELL = initial.SHELL
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "kilo-tools-"))
  dirs.push(dir)
  state = await fs.mkdtemp(path.join(os.tmpdir(), "kilo-tools-state-"))
  dirs.push(state)
  log = path.join(state, "calls.log")
  await fs.writeFile(log, "")
  clearShellEnvCache()
  process.env.KILO_TOOLS_LOG = log
})

afterEach(async () => {
  clearShellEnvCache()
  process.env.PATH = initial.PATH
  process.env.SHELL = initial.SHELL
  await Promise.all(dirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })))
})

async function script(dir: string, name: string, body: string) {
  const file = path.join(dir, name)
  await fs.writeFile(file, `#!/bin/sh\n${body}\n`)
  await fs.chmod(file, 0o755)
  return file
}

async function calls() {
  return (await fs.readFile(log, "utf8")).split("\n").filter(Boolean)
}

function manager(root: string, binary: string, platform: NodeJS.Platform = "linux") {
  return new WorktreeManager(root, () => {}, undefined, binary, 1, undefined, { platform })
}

async function repo() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "kilo-tools-repo-"))
  dirs.push(root)
  const git = process.env.KILO_REAL_GIT
  if (!git) throw new Error("KILO_REAL_GIT is required")
  const run = (args: string[]) => {
    const result = Bun.spawnSync([git, ...args], { cwd: root, stdout: "pipe", stderr: "pipe" })
    if (result.exitCode !== 0) throw new Error(result.stderr.toString("utf8"))
  }
  run(["init", "-q"])
  run(["-c", "user.name=T", "-c", "user.email=t@example.com", "commit", "--allow-empty", "-qm", "x"])
  return root
}

describe("Git probe", () => {
  it("guards the modal branch request before any Git execution on an Apple shim", async () => {
    const root = await repo()
    const bin = await fs.mkdtemp(path.join(os.tmpdir(), "kilo-tools-bin-"))
    dirs.push(bin)
    const shim = path.join(bin, "git")
    await fs.symlink("/usr/bin/git", shim)
    await script(
      bin,
      "xcode-select",
      `echo "xcode-select $@" >> "$KILO_TOOLS_LOG"\necho "no developer tools" >&2\nexit 2`,
    )
    const previous = process.env.PATH
    process.env.PATH = [bin, previous].join(path.delimiter)
    try {
      const mgr = manager(root, shim, "darwin")
      await expect(mgr.listBranches()).rejects.toThrow(/Git is not installed/)
      expect(await calls()).toEqual(["xcode-select -p"])
      expect(mgr.gitProbeFailed).toBe(true)
      const probe = await mgr.probeGit()
      expect(probe.ok).toBe(false)
      expect(probe.ok ? "" : probe.detail).toContain("no developer tools")
    } finally {
      process.env.PATH = previous
    }
  })

  it("never guards a Homebrew or custom Git", async () => {
    const root = await repo()
    const bin = await fs.mkdtemp(path.join(os.tmpdir(), "kilo-tools-bin-"))
    dirs.push(bin)
    await script(bin, "xcode-select", `echo "xcode-select $@" >> "$KILO_TOOLS_LOG"\nexit 2`)
    const custom = await script(bin, "custom-git", `echo "git $@" >> "$KILO_TOOLS_LOG"\nexec "$KILO_REAL_GIT" "$@"`)
    const previous = process.env.PATH
    process.env.PATH = [bin, previous].join(path.delimiter)
    try {
      const mgr = manager(root, custom, "darwin")
      const branches = await mgr.listBranches()
      expect(branches.defaultBranch).toBeTruthy()
      expect(await calls()).not.toContain("xcode-select -p")
      expect((await calls()).some((line) => line.startsWith("git "))).toBe(true)
    } finally {
      process.env.PATH = previous
    }
  }, 60_000)

  it("recomputes probeFailed instead of keeping a sticky missing verdict", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "kilo-tools-root-"))
    dirs.push(root)
    const bin = path.join(await fs.mkdtemp(path.join(os.tmpdir(), "kilo-tools-bin-")), "git")
    dirs.push(path.dirname(bin))

    const missing = manager(root, bin, "linux")
    expect(await missing.probeGit()).toMatchObject({ ok: false, code: "missing" })
    expect(missing.gitProbeFailed).toBe(true)

    await fs.writeFile(bin, "#!/bin/sh\nexit 0\n")
    await fs.chmod(bin, 0o644)
    const denied = await missing.probeGit()
    expect(denied.ok).toBe(false)
    expect(denied.ok ? "" : denied.code).toBe("unknown")
    expect(missing.gitProbeFailed).toBe(false)

    await fs.chmod(bin, 0o755)
    expect(await missing.probeGit()).toEqual({ ok: true })
    expect(missing.gitProbeFailed).toBe(false)
  })

  it("preserves raw Git and Git LFS errors and only blocks confirmed absence", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "kilo-tools-root-"))
    dirs.push(root)
    const bin = await fs.mkdtemp(path.join(os.tmpdir(), "kilo-tools-bin-"))
    dirs.push(bin)

    const xcrun = await script(
      bin,
      "git-xcrun",
      `echo "xcrun: error: invalid active developer path (/Library/Developer/CommandLineTools)" >&2\nexit 1`,
    )
    const missing = await manager(root, xcrun, "linux").probeGit()
    expect(missing.ok).toBe(false)
    expect(missing.ok ? "" : missing.code).toBe("missing")
    expect(missing.ok ? "" : missing.detail).toContain("invalid active developer path")

    const remote = await script(
      bin,
      "git-remote",
      `if [ "$1" = "lfs" ]; then echo "fatal: could not read from remote repository" >&2; exit 128; fi\nexit 0`,
    )
    const unknown = await manager(root, remote, "linux").probeLfs()
    expect(unknown.ok).toBe(false)
    expect(unknown.ok ? "" : unknown.code).toBe("unknown")
    expect(unknown.ok ? "" : unknown.detail).toContain("could not read from remote repository")

    const noLfs = await script(
      bin,
      "git-no-lfs",
      `if [ "$1" = "lfs" ]; then echo "git: 'lfs' is not a git command. See 'git --help'." >&2; exit 1; fi\nexit 0`,
    )
    const absent = await manager(root, noLfs, "linux").probeLfs()
    expect(absent.ok).toBe(false)
    expect(absent.ok ? "" : absent.code).toBe("missing")
  })
})

describe("fresh tool checks", () => {
  it("refreshes the login-shell PATH only for fresh checks and updates both LFS caches", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "kilo-tools-root-"))
    dirs.push(root)
    const bin = await fs.mkdtemp(path.join(os.tmpdir(), "kilo-tools-bin-"))
    dirs.push(bin)
    const later = await fs.mkdtemp(path.join(os.tmpdir(), "kilo-tools-later-"))
    dirs.push(later)
    const shellCalls = path.join(state, "shell.log")
    await fs.writeFile(shellCalls, "")
    const shell = await script(
      state,
      "shell",
      `echo x >> "${shellCalls}"\necho "PATH=$(cat "${path.join(state, "path")}")"`,
    )
    const git = await script(
      bin,
      "git",
      `echo "git $@" >> "$KILO_TOOLS_LOG"\nif [ "$1" = "lfs" ]; then\n  found=$(command -v git-lfs)\n  if [ -n "$found" ]; then exec "$found" version; fi\n  echo "git: 'lfs' is not a git command." >&2\n  exit 1\nfi\nexit 0`,
    )
    const lfs = await script(later, "git-lfs", `echo "git-lfs/3.0"`)

    const previous = { PATH: process.env.PATH, SHELL: process.env.SHELL }
    process.env.SHELL = shell
    process.env.PATH = [bin, process.env.PATH].join(path.delimiter)
    await fs.writeFile(path.join(state, "path"), process.env.PATH)

    try {
      const mgr = manager(root, git, "linux")
      expect(await mgr.probeLfs()).toMatchObject({ ok: false, code: "missing" })
      expect(await mgr.probeLfs()).toMatchObject({ ok: false, code: "missing" })
      expect((await calls()).filter((line) => line.startsWith("git lfs version"))).toHaveLength(1)

      await fs.writeFile(path.join(state, "path"), [later, bin, previous.PATH].join(path.delimiter))
      expect(lfs).toBe(path.join(later, "git-lfs"))
      expect(await mgr.probeLfs()).toMatchObject({ ok: false, code: "missing" })
      expect((await fs.readFile(shellCalls, "utf8")).trim()).toBe("")

      expect(await mgr.probeLfs(true)).toEqual({ ok: true })
      expect((await fs.readFile(shellCalls, "utf8")).trim().split("\n")).toHaveLength(1)
      expect(process.env.PATH?.startsWith(later)).toBe(true)
      expect(await mgr.probeLfs()).toEqual({ ok: true })
      expect((await fs.readFile(shellCalls, "utf8")).trim().split("\n")).toHaveLength(1)
    } finally {
      process.env.PATH = previous.PATH
      process.env.SHELL = previous.SHELL
    }
  })

  it("reports a non-missing Git failure without blocking", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "kilo-tools-root-"))
    dirs.push(root)
    const bin = await fs.mkdtemp(path.join(os.tmpdir(), "kilo-tools-bin-"))
    dirs.push(bin)
    const slow = await script(bin, "git-fail", `echo "permission denied while reading the repository" >&2\nexit 1`)
    const probe: ToolProbe = await manager(root, slow, "linux").probeGit()
    expect(probe.ok).toBe(false)
    expect(probe.ok ? "" : probe.code).toBe("unknown")
    expect(probe.ok ? "" : probe.detail).toContain("permission denied")
  })
})

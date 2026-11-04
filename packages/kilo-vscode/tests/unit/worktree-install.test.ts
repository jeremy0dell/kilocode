import { afterEach, describe, expect, it } from "bun:test"
import os from "node:os"
import path from "node:path"
import fs from "node:fs/promises"
import {
  DOWNLOAD,
  detectInstaller,
  installTool,
  type InstallCommand,
  type InstallDeps,
  type ToolKind,
  type ToolProbe,
} from "../../src/agent-manager/worktree-install"

const dirs: string[] = []

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })))
})

async function bin(dir: string, name: string) {
  const file = path.join(dir, name)
  await fs.writeFile(file, "#!/bin/sh\nexit 0\n")
  await fs.chmod(file, 0o755)
  return file
}

async function dir() {
  const made = await fs.mkdtemp(path.join(os.tmpdir(), "kilo-install-"))
  dirs.push(made)
  return made
}

function deps(
  platform: NodeJS.Platform,
  envPath: string,
  run: (name: string, command: InstallCommand) => Promise<number | undefined>,
  options: { probe?: (kind: ToolKind, fresh: boolean) => Promise<ToolProbe>; open?: (url: string) => void } = {},
): InstallDeps {
  return {
    platform,
    env: { ...process.env, PATH: envPath },
    git: "/selected/git",
    run,
    open: options.open ?? (() => {}),
    probe: options.probe ?? (async () => ({ ok: true })),
  }
}

describe("installer detection", () => {
  it("resolves only allowlisted managers from the explicit PATH", async () => {
    const apt = await dir()
    await bin(apt, "apt-get")
    expect(await detectInstaller("git", "linux", { PATH: apt })).toBe("apt")
    expect(await detectInstaller("lfs", "linux", { PATH: apt })).toBe("apt")

    const dnf = await dir()
    await bin(dnf, "dnf")
    expect(await detectInstaller("git", "linux", { PATH: dnf })).toBe("dnf")
    expect(await detectInstaller("git", "linux", { PATH: "/usr/bin:/bin" })).toBeUndefined()
  })

  it("uses Apple's launcher for Git on macOS and brew for LFS", async () => {
    const mac = await dir()
    await bin(mac, "xcode-select")
    await bin(mac, "brew")
    expect(await detectInstaller("git", "darwin", { PATH: mac })).toBe("apple")
    expect(await detectInstaller("lfs", "darwin", { PATH: mac })).toBe("brew")
  })

  it("uses winget on Windows", async () => {
    const win = await dir()
    await bin(win, "winget.EXE")
    expect(await detectInstaller("git", "win32", { PATH: win, PATHEXT: ".EXE" })).toBe("winget")
  })

  it("reads Windows Path and PathExt case-insensitively", async () => {
    const win = await dir()
    await bin(win, "winget.EXE")
    expect(await detectInstaller("git", "win32", { Path: win, PathExt: ".EXE" })).toBe("winget")
  })
})

describe("install outcomes", () => {
  it("runs separate package and git-lfs steps without absolute installer paths", async () => {
    const linux = await dir()
    await bin(linux, "apt-get")
    const calls: Array<{ name: string; command: InstallCommand }> = []
    const outcome = await installTool(
      "lfs",
      await dir(),
      deps("linux", linux, async (name, command) => {
        calls.push({ name, command })
        return 0
      }),
    )

    expect(outcome).toEqual({ kind: "lfs", mode: "terminal", ok: true })
    expect(calls.map((call) => call.name)).toEqual(["Install Git LFS", "Set up Git LFS"])
    expect(calls[0]?.command).toMatchObject({ command: "sudo", args: ["apt-get", "install", "-y", "git-lfs"] })
    expect(calls[1]?.command).toMatchObject({ command: "/selected/git", args: ["lfs", "install"] })
    // The package-manager recipe never uses an absolute installer path. The
    // separate git-lfs step intentionally uses the selected Git executable.
    expect(calls[0]?.command.command).not.toStartWith(path.sep)
    expect(calls[0]?.command.args[0] ?? "").not.toStartWith(path.sep)
  })

  it("counts demonstrated availability as success, even after a non-zero or stopped task", async () => {
    const linux = await dir()
    await bin(linux, "apt-get")
    const exists: ToolProbe = { ok: true }

    expect(
      await installTool(
        "git",
        await dir(),
        deps("linux", linux, async () => 1, { probe: async () => exists }),
      ),
    ).toEqual({ kind: "git", mode: "terminal", ok: true })

    expect(
      await installTool(
        "git",
        await dir(),
        deps("linux", linux, async () => undefined, { probe: async () => exists }),
      ),
    ).toEqual({ kind: "git", mode: "terminal", ok: true })
  })

  it("reports a failed or stopped install that leaves the tool missing", async () => {
    const linux = await dir()
    await bin(linux, "apt-get")
    const missing: ToolProbe = { ok: false, code: "missing", detail: "not installed" }

    expect(
      await installTool(
        "git",
        await dir(),
        deps("linux", linux, async () => 1, { probe: async () => missing }),
      ),
    ).toEqual({ kind: "git", mode: "terminal", ok: false, code: 1 })

    expect(
      await installTool(
        "git",
        await dir(),
        deps("linux", linux, async () => undefined, { probe: async () => missing }),
      ),
    ).toEqual({ kind: "git", mode: "terminal", ok: false, stopped: true })
  })

  it("keeps a task start failure for Show details and still honors later availability", async () => {
    const linux = await dir()
    await bin(linux, "apt-get")
    const failure = async () => {
      throw new Error("terminal could not start")
    }
    const missing: ToolProbe = { ok: false, code: "missing", detail: "not installed" }
    const installed = await installTool(
      "git",
      await dir(),
      deps("linux", linux, failure, { probe: async () => ({ ok: true }) }),
    )
    expect(installed).toEqual({ kind: "git", mode: "terminal", ok: true })

    const failed = await installTool("git", await dir(), deps("linux", linux, failure, { probe: async () => missing }))
    expect(failed).toMatchObject({ kind: "git", mode: "terminal", ok: false, error: "terminal could not start" })
  })

  it("launches Apple's installer when macOS has no Git", async () => {
    const mac = await dir()
    await bin(mac, "xcode-select")
    const calls: InstallCommand[] = []
    const outcome = await installTool(
      "git",
      await dir(),
      deps(
        "darwin",
        mac,
        async (_name, command) => {
          calls.push(command)
          return 0
        },
        { probe: async () => ({ ok: false, code: "missing", detail: "no tools" }) },
      ),
    )
    expect(outcome).toEqual({ kind: "git", mode: "apple", ok: true })
    expect(calls).toEqual([expect.objectContaining({ command: "xcode-select", args: ["--install"], mode: "launcher" })])
  })

  it("keeps an Apple launcher failure instead of showing a fake in-progress state", async () => {
    const mac = await dir()
    await bin(mac, "xcode-select")
    const outcome = await installTool(
      "git",
      await dir(),
      deps("darwin", mac, async () => 2, { probe: async () => ({ ok: false, code: "missing", detail: "no tools" }) }),
    )
    expect(outcome).toMatchObject({ kind: "git", mode: "apple", ok: false, error: "xcode-select exited with code 2" })
  })

  it("opens the download page when no manager exists", async () => {
    const opened: string[] = []
    for (const kind of ["git", "lfs"] as const) {
      const empty = await dir()
      const outcome = await installTool(
        kind,
        await dir(),
        deps("linux", empty, async () => 0, { open: (url) => opened.push(url) }),
      )
      expect(outcome).toEqual({ kind, mode: "external", ok: false })
    }
    expect(opened).toEqual([DOWNLOAD.git, DOWNLOAD.lfs])
  })
})

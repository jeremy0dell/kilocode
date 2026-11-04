import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import os from "node:os"
import path from "node:path"
import fs from "node:fs/promises"
import { GitOps } from "../../src/agent-manager/GitOps"
import { check, fix, type FixDeps, type ReadinessTools } from "../../src/agent-manager/worktree-readiness"
import { createProjectWiring } from "../../src/agent-manager/project/wiring"
import { handleProjectMessage } from "../../src/agent-manager/project/messages"
import { canonicalizePath, projectIdFor } from "../../src/agent-manager/project/paths"
import type { Host } from "../../src/agent-manager/host"
import type { AgentManagerOutMessage } from "../../src/agent-manager/types"

const dirs: string[] = []
let env: NodeJS.ProcessEnv
let home: string
let ops: GitOps

// Isolate from the developer's Git config: private HOME and XDG_CONFIG_HOME with their own
// .gitconfig (simple-git drops GIT_* variables, so HOME is what isolates the WorktreeManager path),
// GIT_CONFIG_GLOBAL/NOSYSTEM for direct git calls, and no inherited identity. The global config has
// no identity and forbids guessing one, so commits need the identity the fix saves. Nothing here
// runs in its own Bun process so outstanding work in other suites cannot see this HOME.
beforeEach(async () => {
  if (!process.env.KILO_READINESS_HOME || process.env.HOME !== process.env.KILO_READINESS_HOME)
    throw new Error("Run this fixture through tests/unit/worktree-readiness.test.ts with a private HOME")
  env = { ...process.env }
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("GIT_") || key === "EMAIL") delete process.env[key]
  }
  home = canonicalizePath(process.env.HOME!)
  const config = path.join(home, ".gitconfig")
  await fs.writeFile(
    config,
    "[user]\n\tuseConfigOnly = true\n[init]\n\tdefaultBranch = trunk\n[commit]\n\tgpgsign = false\n",
  )
  process.env.HOME = home
  process.env.XDG_CONFIG_HOME = home
  process.env.GIT_CONFIG_GLOBAL = config
  process.env.GIT_CONFIG_NOSYSTEM = "1"
  process.env.LC_ALL = "C"
  process.env.GIT_TERMINAL_PROMPT = "0"
  ops = new GitOps({ log: () => {} })
})

afterEach(async () => {
  if (!env) return
  ops.dispose()
  for (const key of Object.keys(process.env)) {
    if (!(key in env)) delete process.env[key]
  }
  Object.assign(process.env, env)
  await Promise.all(dirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })))
  await fs.rm(path.join(home, ".git"), { recursive: true, force: true })
  await fs.rm(path.join(home, "child"), { recursive: true, force: true })
})

async function temp(prefix: string) {
  const dir = canonicalizePath(await fs.mkdtemp(path.join(os.tmpdir(), prefix)))
  dirs.push(dir)
  return dir
}

function git(cwd: string, ...args: string[]) {
  // Bun.spawnSync doesn't pick up process.env changes on its own; pass the isolated env explicitly.
  const result = Bun.spawnSync(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe", env: { ...process.env } })
  if (result.exitCode !== 0) throw new Error(Buffer.from(result.stderr).toString("utf8"))
  return Buffer.from(result.stdout).toString("utf8").trim()
}

async function repo(dir: string, commit: boolean) {
  await fs.mkdir(dir, { recursive: true })
  git(dir, "init", "-q")
  if (commit) git(dir, "-c", "user.name=T", "-c", "user.email=t@example.com", "commit", "--allow-empty", "-qm", "x")
  return dir
}

/** The real project wiring over a fake Host that records what the fixes ask of VS Code. */
function wire(root: string, trusted = true) {
  const posts: AgentManagerOutMessage[] = []
  const calls = { refresh: 0, reloads: 0, picks: [] as Array<string | undefined> }
  const focus: Array<() => void> = []
  let stored: unknown
  const none = { dispose: () => {} }
  const host = {
    readProjects: () => stored,
    writeProjects: async (value: unknown) => {
      stored = value
    },
    workspacePath: () => root,
    unregisterProjectRoutes: () => {},
    worktreePool: () => false,
    onDidChangeWorkspaceFolders: () => none,
    onDidChangeWorktreePool: () => none,
    onWindowFocus: (cb: () => void) => {
      focus.push(cb)
      return none
    },
    reloadWindow: () => {
      calls.reloads++
    },
    pickFolder: async (opts?: { defaultPath?: string }) => {
      calls.picks.push(opts?.defaultPath)
      return undefined
    },
    isTrusted: () => trusted,
    refreshGit: () => {
      calls.refresh++
    },
    showError: () => {},
    notify: () => {},
    openSettings: () => {},
    openDocument: async () => {},
  } as unknown as Host
  const wiring = createProjectWiring({
    host,
    git: ops,
    log: () => {},
    output: () => {},
    activate: () => {},
    empty: () => {},
    expand: () => {},
    ready: async () => ({ ok: true, refsFixed: 0, current: true }),
    push: () => {},
    pushState: () => {},
    changed: () => {},
    selected: () => {},
    post: (message) => posts.push(message),
  })
  const id = projectIdFor(canonicalizePath(root))
  const send = (fix: "initGit" | "initialCommit" | "useProject", extra: Record<string, unknown> = {}) =>
    handleProjectMessage(
      { type: "agentManager.fixReadiness", projectId: id, requestID: "r1", fix, ...extra },
      wiring.messages,
    )
  return { posts, calls, focus, wiring, id, send }
}

const identity = { name: "Ada Lovelace", email: "ada@example.com" }

describe("worktree readiness tool checks", () => {
  const fake = (overrides: Partial<ReadinessTools> = {}) => {
    const calls: string[] = []
    const tools: ReadinessTools = {
      git: async (fresh) => {
        calls.push(`git:${fresh}`)
        return { ok: true }
      },
      usesLfs: async (root) => {
        calls.push(`uses:${path.basename(root)}`)
        return false
      },
      lfs: async (_root, fresh) => {
        calls.push(`lfs:${fresh}`)
        return { ok: true }
      },
      installer: async (kind) => {
        calls.push(`installer:${kind}`)
        return "apt"
      },
      install: async (kind) => ({ kind, mode: "terminal", ok: true }),
      download: () => {},
      ...overrides,
    }
    return { calls, tools }
  }

  it("reports missing Git before touching the repository", async () => {
    const root = await temp("kilo-ready-git-")
    const probe = fake({ git: async () => ({ ok: false, code: "missing", detail: "spawn git ENOENT" }) })
    const result = await check(root, { git: ops, trusted: () => true, tools: probe.tools, platform: "linux" })
    expect(result).toEqual({
      status: "blocked",
      code: "git_not_found",
      name: path.basename(root),
      trusted: true,
      platform: "linux",
      installer: "apt",
    })
    expect(probe.calls).toEqual(["installer:git"])
  })

  it("keeps an ambiguous Git failure advisory", async () => {
    const root = await temp("kilo-ready-git-unknown-")
    const probe = fake({ git: async () => ({ ok: false, code: "unknown", detail: "permission denied" }) })
    const result = await check(root, { git: ops, trusted: () => true, tools: probe.tools })
    expect(result).toEqual({ status: "unknown", detail: "permission denied" })
    expect(probe.calls).toEqual([])
  })

  it("checks Git LFS last and only when the repository uses it", async () => {
    const lfsRepo = await repo(await temp("kilo-ready-lfs-"), true)
    await fs.writeFile(path.join(lfsRepo, ".gitattributes"), "*.bin filter=lfs diff=lfs merge=lfs -text\n")
    const used = fake({
      usesLfs: async (root) => {
        calls.push(`uses:${path.basename(root)}`)
        return true
      },
      lfs: async (_root, fresh) => {
        calls.push(`lfs:${fresh}`)
        return { ok: false, code: "missing", detail: "git: 'lfs' is not a git command." }
      },
    })
    const calls: string[] = used.calls
    const blocked = await check(lfsRepo, { git: ops, trusted: () => true, tools: used.tools, platform: "darwin" })
    expect(blocked).toEqual({
      status: "blocked",
      code: "lfs_missing",
      name: path.basename(lfsRepo),
      trusted: true,
      platform: "darwin",
      installer: "apt",
    })
    expect(calls[0]).toBe("git:false")
    expect(calls.at(-1)).toBe("installer:lfs")

    const plainRepo = await repo(await temp("kilo-ready-no-lfs-"), true)
    const plain = fake()
    expect(await check(plainRepo, { git: ops, trusted: () => true, tools: plain.tools })).toEqual({
      status: "ready",
    })
    expect(plain.calls).toEqual(["git:false", `uses:${path.basename(plainRepo)}`])
  })

  it("refuses an install without workspace trust and never runs it", async () => {
    const root = await temp("kilo-ready-untrusted-")
    let called = 0
    const tools: ReadinessTools = {
      ...fake().tools,
      install: async (kind) => {
        called++
        return { kind, mode: "terminal", ok: true }
      },
    }
    const deps: FixDeps = {
      git: ops,
      trusted: () => false,
      tools,
      exclude: async () => {},
      refresh: () => {},
      branches: async () => {},
      attach: async () => "p",
      pick: async () => undefined,
    }
    const outcome = await fix(root, { fix: "installGit" }, deps)
    expect(called).toBe(0)
    expect(outcome.error).toBe("Trust this VS Code window before Kilo changes the project.")
    expect(outcome.result.status).toBe("blocked")
  })

  it("routes install and download fixes before inspecting the repository", async () => {
    const root = await temp("kilo-ready-install-")
    const calls: string[] = []
    const probe = fake()
    const tools: ReadinessTools = {
      ...probe.tools,
      install: async (kind, dir) => {
        calls.push(`install:${kind}:${dir}`)
        return { kind, mode: "terminal", ok: true }
      },
      download: (kind) => calls.push(`download:${kind}`),
    }
    const deps: FixDeps = {
      git: ops,
      trusted: () => true,
      tools,
      exclude: async () => {
        throw new Error("install must not touch excludes")
      },
      refresh: () => {},
      branches: async () => {},
      attach: async () => "p",
      pick: async () => undefined,
    }

    const installed = await fix(root, { fix: "installGit" }, deps)
    expect(installed.install).toEqual({ kind: "git", mode: "terminal", ok: true })
    expect(installed.result).toMatchObject({ status: "blocked", code: "not_git_repo" })
    await fix(root, { fix: "downloadLfs" }, deps)
    expect(calls).toEqual([`install:git:${root}`, "download:lfs"])
  })

  it("passes fresh through to both tool probes", async () => {
    const healthy = await repo(await temp("kilo-ready-fresh-"), true)
    const probe = fake()
    expect(await check(healthy, { git: ops, trusted: () => true, tools: probe.tools }, true)).toEqual({
      status: "ready",
    })
    expect(probe.calls).toEqual(["git:true", `uses:${path.basename(healthy)}`])
  })
})

describe("worktree readiness check", () => {
  it("classifies each folder state from real repositories", async () => {
    const plain = await temp("kilo-ready-plain-")
    await fs.writeFile(path.join(plain, "notes.txt"), "draft")
    const parent = await temp("kilo-ready-parent-")
    for (const name of ["atlas", "beta", "comet", "delta"]) await repo(path.join(parent, name), true)
    await fs.mkdir(path.join(parent, "docs"))
    const empty = await repo(await temp("kilo-ready-empty-"), false)
    const healthy = await repo(await temp("kilo-ready-healthy-"), true)
    const broken = await temp("kilo-ready-broken-")
    await fs.mkdir(path.join(broken, ".git"))

    const deps = { git: ops, trusted: () => true }
    expect(await check(plain, deps)).toEqual({
      status: "blocked",
      code: "not_git_repo",
      name: path.basename(plain),
      trusted: true,
      identity: false,
    })
    expect(await check(parent, deps)).toEqual({
      status: "blocked",
      code: "not_git_repo",
      name: path.basename(parent),
      trusted: true,
      projects: ["atlas", "beta", "comet"].map((label) => ({ root: path.join(parent, label), label })),
      more: true,
    })
    const root = path.parse(plain).root
    expect(await check(root, deps)).toEqual({
      status: "blocked",
      code: "not_git_repo",
      name: path.basename(root),
      trusted: true,
      restricted: true,
    })
    expect(await check(empty, deps)).toEqual({
      status: "blocked",
      code: "no_commits",
      name: path.basename(empty),
      trusted: true,
      identity: false,
    })
    expect(await check(healthy, deps)).toEqual({ status: "ready" })
    const result = await check(broken, deps)
    expect(result.status).toBe("unknown")
    expect(result.status === "unknown" && result.detail).toContain(broken)
  })
})

describe("worktree readiness fixes", () => {
  it("refuses a child of a repository rooted at HOME without changing its exclude", async () => {
    await repo(home, false)
    const child = path.join(home, "child")
    await fs.mkdir(child)
    const file = path.join(home, ".git", "info", "exclude")
    const before = await fs.readFile(file)
    const setup = wire(child)
    await setup.send("initialCommit", { identity })
    expect(Buffer.compare(await fs.readFile(file), before)).toBe(0)
    expect(await check(child, { git: ops, trusted: () => true })).toMatchObject({
      status: "blocked",
      code: "not_git_repo",
      restricted: true,
    })
    expect(setup.posts.at(-1)).toMatchObject({ error: expect.stringContaining("home folder") })
  })

  it.each(["identity", "attach"] as const)(
    "rechecks current trust before %s after an await boundary",
    async (mutation) => {
      const root = await repo(await temp("kilo-ready-trust-"), false)
      let trusted = true
      const attached: string[] = []
      const deps: FixDeps = {
        git: ops,
        trusted: () => trusted,
        exclude: async () => {
          trusted = false
        },
        refresh: () => {},
        branches: async () => {},
        attach: async (dir) => {
          attached.push(dir)
          return "picked"
        },
        pick: async () => {
          trusted = false
          return root
        },
      }
      const outcome = await fix(
        root,
        mutation === "identity" ? { fix: "initialCommit", identity } : { fix: "pickFolder" },
        deps,
      )
      expect(outcome.error).toContain("Trust")
      expect(git(root, "config", "--local", "--list")).not.toMatch(/user\.(name|email)=/)
      expect(attached).toEqual([])
    },
  )

  it("writes Kilo excludes immediately after init even when identity configuration fails", async () => {
    const root = await temp("kilo-ready-invalid-identity-")
    const setup = wire(root)
    await setup.send("initGit", { identity: { name: "bad\nname", email: identity.email } })
    expect(setup.posts.at(-1)).toMatchObject({ error: expect.stringContaining("Invalid Git name") })
    const exclude = await fs.readFile(path.join(root, ".git", "info", "exclude"), "utf8")
    expect(exclude).toContain("\n.kilo/worktrees/\n")
    expect(exclude).toContain("\n.kilo/agent-manager.json\n")
    expect(
      Bun.spawnSync(["git", "rev-parse", "--verify", "HEAD"], { cwd: root, env: { ...process.env } }).exitCode,
    ).not.toBe(0)
  })

  it("sets up Git in order: one empty commit, Kilo excludes, local identity, branches before the reply", async () => {
    const global = await fs.readFile(path.join(home, ".gitconfig"), "utf8")
    const scratch = await temp("kilo-ready-scratch-")
    await fs.writeFile(path.join(scratch, "notes.txt"), "draft")
    const setup = wire(scratch)

    expect(await setup.send("initGit", { identity })).toBe(true)

    expect(git(scratch, "rev-list", "--count", "HEAD")).toBe("1")
    expect(git(scratch, "ls-tree", "-r", "HEAD")).toBe("")
    expect(git(scratch, "status", "--porcelain")).toBe("?? notes.txt")
    const exclude = await fs.readFile(path.join(scratch, ".git", "info", "exclude"), "utf8")
    expect(exclude).toContain("\n.kilo/worktrees/\n")
    expect(exclude).toContain("\n.kilo/agent-manager.json\n")
    expect(git(scratch, "config", "--local", "user.name")).toBe(identity.name)
    expect(git(scratch, "config", "--local", "user.email")).toBe(identity.email)
    expect(await fs.readFile(path.join(home, ".gitconfig"), "utf8")).toBe(global)
    expect(setup.calls.refresh).toBe(1)
    expect(setup.posts.map((post) => post.type)).toEqual(["agentManager.branches", "agentManager.readiness"])
    expect(setup.posts.at(0)).toMatchObject({ projectId: setup.id, defaultBranch: "trunk" })
    expect(setup.posts.at(0)).toMatchObject({ branches: [expect.objectContaining({ name: "trunk" })] })
    expect(setup.posts.at(1)).toEqual({
      type: "agentManager.readiness",
      projectId: setup.id,
      requestID: "r1",
      result: { status: "ready", note: "uncommitted" },
    })
  })

  it("creates the first commit without committing staged or untracked files", async () => {
    const empty = await repo(await temp("kilo-ready-first-"), false)
    await fs.writeFile(path.join(empty, "staged.txt"), "staged")
    await fs.writeFile(path.join(empty, "loose.txt"), "loose")
    git(empty, "add", "staged.txt")
    const setup = wire(empty)

    await setup.send("initialCommit", { identity })

    expect(git(empty, "rev-list", "--count", "HEAD")).toBe("1")
    expect(git(empty, "ls-tree", "-r", "HEAD")).toBe("")
    expect(git(empty, "status", "--porcelain").split("\n")).toEqual(["A  staged.txt", "?? loose.txt"])
    expect(await fs.readFile(path.join(empty, ".git", "info", "exclude"), "utf8")).toContain("\n.kilo/worktrees/\n")
    expect(setup.posts.map((post) => post.type)).toEqual(["agentManager.branches", "agentManager.readiness"])
    expect(setup.posts.at(1)).toMatchObject({ result: { status: "ready", note: "uncommitted" } })
  })

  it("refuses to change an untrusted window or the home folder", async () => {
    const scratch = await temp("kilo-ready-untrusted-")
    const untrusted = wire(scratch, false)
    await untrusted.send("initGit", { identity })
    expect(await Bun.file(path.join(scratch, ".git", "HEAD")).exists()).toBe(false)
    expect(untrusted.posts).toEqual([
      {
        type: "agentManager.readiness",
        projectId: untrusted.id,
        requestID: "r1",
        result: {
          status: "blocked",
          code: "not_git_repo",
          name: path.basename(scratch),
          trusted: false,
          identity: false,
        },
        error: expect.stringContaining("Trust"),
      },
    ])
  })

  it("shows the home folder as restricted and never runs git init there", async () => {
    // Bun reads the home folder once at startup, so the home folder case runs in a child process.
    const script = `
      const { check, fix } = await import(${JSON.stringify(path.resolve(import.meta.dir, "../../src/agent-manager/worktree-readiness.ts"))})
      const { GitOps } = await import(${JSON.stringify(path.resolve(import.meta.dir, "../../src/agent-manager/GitOps.ts"))})
      const git = new GitOps({ log: () => {} })
      const home = process.env.HOME
      const deps = { git, trusted: () => true }
      const calls = []
      const record = (name) => async () => { calls.push(name) }
      const checked = await check(home, deps)
      const fixed = await fix(home, { fix: "initGit", identity: { name: "A", email: "a@example.com" } }, {
        ...deps, exclude: record("exclude"), refresh: () => calls.push("refresh"), branches: record("branches"),
        attach: async () => "", pick: async () => undefined,
      })
      git.dispose()
      console.log(JSON.stringify({ checked, fixed, calls }))
    `
    const result = Bun.spawnSync(["bun", "-e", script], { stdout: "pipe", stderr: "pipe", env: { ...process.env } })
    expect(Buffer.from(result.stderr).toString("utf8")).toBe("")
    const out = JSON.parse(Buffer.from(result.stdout).toString("utf8"))
    const card = { status: "blocked", code: "not_git_repo", name: path.basename(home), trusted: true, restricted: true }
    expect(out.checked).toEqual(card)
    expect(out.fixed).toEqual({ result: card, error: expect.stringContaining("home folder") })
    expect(out.calls).toEqual([])
    expect(await Bun.file(path.join(home, ".git", "HEAD")).exists()).toBe(false)
  })

  it("posts a window-focus trigger and reloads the window when asked", async () => {
    const root = await temp("kilo-ready-focus-")
    const setup = wire(root)
    for (const cb of setup.focus) cb()
    expect(setup.posts).toContainEqual({ type: "agentManager.readinessFocus" })
    await handleProjectMessage({ type: "agentManager.reloadWindow" }, setup.wiring.messages)
    expect(setup.calls.reloads).toBe(1)
  })

  it("switches to a project inside the folder and refuses one outside it", async () => {
    const parent = await temp("kilo-ready-switch-")
    const inner = await repo(path.join(parent, "orbit"), true)
    const outside = await repo(await temp("kilo-ready-outside-"), true)
    const setup = wire(parent)

    await setup.send("useProject", { target: outside })
    await setup.send("useProject", { target: inner })

    expect(setup.posts.at(0)).toMatchObject({ projectId: setup.id, error: expect.any(String) })
    expect(setup.posts.at(0)).not.toHaveProperty("selected")
    expect(setup.posts.at(1)).toEqual({
      type: "agentManager.readiness",
      projectId: setup.id,
      requestID: "r1",
      selected: projectIdFor(inner),
      result: { status: "ready" },
    })
    expect(setup.wiring.registry.has(projectIdFor(inner))).toBe(true)
  })
})

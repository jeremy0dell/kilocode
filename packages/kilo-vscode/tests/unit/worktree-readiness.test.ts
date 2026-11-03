import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import os from "node:os"
import path from "node:path"
import fs from "node:fs/promises"
import { GitOps } from "../../src/agent-manager/GitOps"
import { check } from "../../src/agent-manager/worktree-readiness"
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
// touches PATH or SHELL, so restoring process.env afterwards is enough.
beforeEach(async () => {
  env = { ...process.env }
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("GIT_") || key === "EMAIL") delete process.env[key]
  }
  home = await temp("kilo-ready-home-")
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
  ops.dispose()
  for (const key of Object.keys(process.env)) {
    if (!(key in env)) delete process.env[key]
  }
  Object.assign(process.env, env)
  await Promise.all(dirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })))
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
  const calls = { refresh: 0, picks: [] as Array<string | undefined> }
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
  return { posts, calls, wiring, id, send }
}

const identity = { name: "Ada Lovelace", email: "ada@example.com" }

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

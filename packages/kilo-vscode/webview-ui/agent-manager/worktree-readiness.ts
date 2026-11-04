/**
 * Worktree readiness controller: asks the extension whether the selected project
 * can hold worktrees, runs the fixes a readiness card offers, and reports the
 * readiness telemetry. It knows nothing about the surface that shows the card.
 *
 * A check that fails, errors or misses its deadline settles as `unknown`, which
 * never blocks creation.
 */

import { createComputed, createSignal, on, onCleanup, type Accessor } from "solid-js"
import type { Readiness, ReadinessFix, ReadinessInstall, ReadinessMessage, WorktreeEntry } from "../src/types/messages"
import { createContextRequests } from "../src/hooks/context-requests"
import { useVSCode } from "../src/context/vscode"
import { useLanguage } from "../src/context/language"
import { TelemetryEventName } from "../../src/services/telemetry/types"

/** How long a check may take before creation proceeds as if it had not run. */
const DEADLINE = 3_000
/** Fixes can wait on a folder picker, so they get a much longer deadline. */
const FIX_DEADLINE = 10 * 60_000
/** Longer than LFS's two chained 30-minute tasks so the task's own error wins. */
const INSTALL_DEADLINE = 65 * 60_000

type Blocked = Extract<Readiness, { status: "blocked" }>
type InstallFix = "installGit" | "installLfs"

export type ReadinessState =
  | { status: "checking"; project?: string }
  | { status: "blocked"; project: string; result: Blocked; error?: string }
  | { status: "fixing"; project: string; result: Blocked; fix: ReadinessFix }
  | {
      status: "installing"
      project: string
      result: Blocked
      fix: InstallFix
      mode: "pending" | "apple"
    }
  | { status: "stale"; project: string; result: Blocked; fix: InstallFix }
  | { status: "ready"; project: string; note?: "uncommitted"; fixed?: ReadinessFix }
  | { status: "unknown"; project: string; detail: string }

const install = (fix: ReadinessFix): fix is InstallFix => fix === "installGit" || fix === "installLfs"

/** The settled state for one reply. */
function settle(project: string, result: Readiness, fixed?: ReadinessFix, error?: string): ReadinessState {
  if (result.status === "blocked") return { status: "blocked", project, result, ...(error ? { error } : {}) }
  if (result.status === "unknown") return { status: "unknown", project, detail: result.detail }
  return { status: "ready", project, ...(result.note ? { note: result.note } : {}), ...(fixed ? { fixed } : {}) }
}

/** Telemetry code for a state that has one. */
function code(state: ReadinessState) {
  if (state.status === "blocked" || state.status === "fixing") return state.result.code
  if (state.status === "installing" || state.status === "stale") return state.result.code
  if (state.status === "unknown") return "unknown"
  return undefined
}

/** Telemetry stage for a settled transition, or nothing when it is a repeat of the same state. */
function stage(prev: ReadinessState, next: ReadinessState) {
  const before = code(prev)
  const after = code(next)
  if (after && (after !== before || prev.project !== next.project)) return { stage: "identified", code: after }
  if (next.status === "ready" && before && before !== "unknown") return { stage: "resolved", code: before }
  return undefined
}

/** The card currently shows Git or Git LFS, so a window return should re-check. */
function tool(state: ReadinessState) {
  if (state.status === "installing" || state.status === "stale") return true
  return state.status === "blocked" && (state.result.code === "git_not_found" || state.result.code === "lfs_missing")
}

export function createReadiness(opts: {
  project: Accessor<string | undefined>
  entry: WorktreeEntry
  /** A window-return re-check recovered a Git/LFS card; focus Create without clicking it. */
  onRecovered?: () => void
}) {
  const vscode = useVSCode()
  const { t } = useLanguage()
  const scope = `readiness-${crypto.randomUUID()}`
  const checks = createContextRequests<ReadinessMessage>(`${scope}-check`, DEADLINE, "Readiness check timed out")
  const fixes = createContextRequests<ReadinessMessage>(`${scope}-fix`, FIX_DEADLINE, "Readiness fix timed out")
  const installs = createContextRequests<ReadinessMessage>(
    `${scope}-install`,
    INSTALL_DEADLINE,
    "Readiness install timed out",
  )
  const [state, setState] = createSignal<ReadinessState>({ status: "checking", project: opts.project() })
  const flight = new Map<string, Promise<ReadinessState | undefined>>()
  let disposed = false
  let revision = 0
  let watching: Promise<void> | null = null

  createComputed(
    on(
      opts.project,
      () => {
        revision++
        flight.clear()
        checks.dispose("Readiness project changed", true)
        fixes.dispose("Readiness project changed", true)
        installs.dispose("Readiness project changed", true)
        // A switch fix already applied the selected project's result; keep it while it is re-checked.
        if (state().project !== opts.project()) setState({ status: "checking", project: opts.project() })
      },
      { defer: true },
    ),
  )

  const track = (props: { stage: string; code: string; fix?: ReadinessFix }) =>
    vscode.postMessage({
      type: "telemetry",
      event: TelemetryEventName.AGENT_MANAGER_WORKTREE_READINESS,
      properties: { ...props, entry: opts.entry },
    })

  const apply = (next: ReadinessState, fix?: ReadinessFix) => {
    const event = stage(state(), next)
    setState(next)
    if (event) track({ ...event, ...(fix && event.stage === "resolved" ? { fix } : {}) })
  }

  /** The install a card represents, so a later ready check can show its green line. */
  const installed = (current: ReadinessState): InstallFix | undefined => {
    if (current.status === "installing" || current.status === "stale") return current.fix
    if (current.status === "blocked") {
      if (current.result.code === "git_not_found") return "installGit"
      if (current.result.code === "lfs_missing") return "installLfs"
    }
    return undefined
  }

  const unsub = vscode.onMessage((msg) => {
    if (msg.type === "agentManager.readinessFocus") {
      if (!tool(state()) || watching) return
      watching = check(true, true)
        .then((next) => {
          if (next?.status === "ready") opts.onRecovered?.()
        })
        .finally(() => {
          watching = null
        })
      return
    }
    if (msg.type !== "agentManager.readiness") return
    if (msg.projectId !== opts.project()) return
    checks.settle(msg.requestID, (req) => req.resolve(msg))
    fixes.settle(msg.requestID, (req) => req.resolve(msg))
    installs.settle(msg.requestID, (req) => req.resolve(msg))
  })

  onCleanup(() => {
    disposed = true
    unsub()
    const current = state()
    if (
      (current.status === "blocked" ||
        current.status === "fixing" ||
        current.status === "installing" ||
        current.status === "stale") &&
      current.project === opts.project()
    )
      track({ stage: "abandoned", code: current.result.code })
    checks.dispose("Readiness check cancelled")
    fixes.dispose("Readiness fix cancelled")
    installs.dispose("Readiness install cancelled")
  })

  /**
   * Ask for the current project's readiness. `fresh` bypasses the extension's
   * tool caches and refreshes its login-shell PATH. `keep` keeps showing a
   * Git/LFS card unless the fresh check is ready.
   */
  const check = (fresh = false, keep = false, verify = false): Promise<ReadinessState | undefined> => {
    const project = opts.project()
    if (!project) {
      setState({ status: "checking" })
      return Promise.resolve(undefined)
    }
    const running = flight.get(project)
    if (!fresh && !verify && running) return running
    // Keep showing this project's last result while it is checked again.
    if (state().project !== project) setState({ status: "checking", project })
    const version = revision
    const next = checks
      .request((requestID) =>
        vscode.postMessage({ type: "agentManager.checkReadiness", projectId: project, requestID, fresh, verify }),
      )
      .then(
        (msg) => settle(project, msg.result, installed(state())),
        (err: unknown) =>
          settle(project, { status: "unknown", detail: err instanceof Error ? err.message : String(err) }),
      )
      .then((next) => {
        if (disposed || opts.project() !== project) return undefined
        if (revision !== version) return state()
        // A fix that started meanwhile owns the state.
        if (state().status === "fixing") return state()
        // A terminal install stays "Installing…" until the tool is ready; a check
        // must not drop the pending task and expose a second install button.
        const current = state()
        if (current.status === "installing" && current.mode === "pending" && next.status !== "ready") return current
        // A window-return check keeps a tool card only for an inconclusive result or
        // the same blocker. A different blocker (e.g. no_commits) must win.
        const same = next.status === "blocked" && "result" in current && next.result.code === current.result.code
        if (keep && next.status !== "ready" && (next.status === "unknown" || same)) return current
        apply(next, installed(state()))
        return next
      })
      .finally(() => {
        if (flight.get(project) === next) flight.delete(project)
      })
    flight.set(project, next)
    return next
  }

  /** Run a fix for the current blocker. Resolves the project a switch fix selected. */
  const run = async (
    kind: ReadinessFix,
    extra: { target?: string; identity?: { name: string; email: string } } = {},
  ): Promise<string | undefined> => {
    const current = state()
    const project = opts.project()
    // Downloads only open a page, so they are also valid from the Apple and stale cards.
    if (kind === "downloadGit" || kind === "downloadLfs") {
      if (!project || !tool(current) || current.project !== project) return undefined
      await fixes
        .request((requestID) =>
          vscode.postMessage({ type: "agentManager.fixReadiness", projectId: project, requestID, fix: kind, ...extra }),
        )
        .catch(() => undefined)
      return undefined
    }
    if (current.status !== "blocked" || current.project !== project) return undefined
    revision++
    const installFix = install(kind)
    if (installFix) setState({ status: "installing", project, result: current.result, fix: kind, mode: "pending" })
    else setState({ status: "fixing", project, result: current.result, fix: kind })
    track({ stage: "fix_started", code: current.result.code, fix: kind })
    const pool = installFix ? installs : fixes
    const reply = await pool
      .request((requestID) =>
        vscode.postMessage({ type: "agentManager.fixReadiness", projectId: project, requestID, fix: kind, ...extra }),
      )
      .catch((err: unknown) => ({
        selected: undefined,
        result: current.result,
        error: err instanceof Error ? err.message : String(err),
        install: undefined,
      }))
    if (disposed || opts.project() !== project) return undefined
    if (installFix) {
      applyInstall(project, kind, reply.result, reply.install, reply.error)
      return undefined
    }
    apply(settle(reply.selected ?? project, reply.result, kind, reply.error), kind)
    return reply.selected
  }

  const applyInstall = (
    project: string,
    kind: InstallFix,
    result: Readiness,
    outcome: ReadinessInstall | undefined,
    error: string | undefined,
  ) => {
    if (result.status === "ready") return apply(settle(project, result, kind), kind)
    if (result.status === "unknown") return apply(settle(project, result))
    const expected = kind === "installGit" ? "git_not_found" : "lfs_missing"
    if (outcome?.mode === "apple" && !outcome.error && result.code === expected) {
      return apply({ status: "installing", project, result, fix: kind, mode: "apple" })
    }
    if (outcome?.ok && result.code === expected) {
      return apply({ status: "stale", project, result, fix: kind })
    }
    apply(settle(project, result, kind, error ?? failure(outcome)))
  }

  /** Translate a terminal install's exit state for Show details. */
  const failure = (outcome: ReadinessInstall | undefined) => {
    if (!outcome) return undefined
    if (outcome.error) return outcome.error
    if (outcome.stopped) return t("agentManager.readiness.install.stopped")
    if (outcome.code !== undefined) return t("agentManager.readiness.install.failed", { code: outcome.code })
    return undefined
  }

  const blocked = () => {
    const current = state()
    return (
      (current.status === "blocked" ||
        current.status === "fixing" ||
        current.status === "installing" ||
        current.status === "stale") &&
      current.project === opts.project()
    )
  }

  return { state, blocked, check, fix: run, revision: () => revision }
}

/**
 * One-shot "reopen New Worktree after reload" flag.
 *
 * The Reload action on a Git/Git LFS card writes the flag before asking VS Code
 * to reload. `createReopen` consumes it once, after both the project list and
 * the restored draft have loaded, so a normal reload never opens the modal.
 */

import { createEffect, on, type Accessor } from "solid-js"

const KEY = "advancedDialogReopen"

/** Mark the persisted webview state so the next load reopens the dialog. */
export function markReopen(state: Record<string, unknown>): Record<string, unknown> {
  return { ...state, [KEY]: true }
}

/** Remove the flag from a persisted state and report whether it was set. */
export function takeReopen(state: Record<string, unknown> | undefined): {
  reopen: boolean
  state: Record<string, unknown>
} {
  const next = { ...(state ?? {}) }
  const reopen = next[KEY] === true
  delete next[KEY]
  return { reopen, state: next }
}

export interface ReopenOptions {
  /** Worktree/session state has loaded. */
  loaded: Accessor<boolean>
  /** The project catalog has arrived, so the restored draft has a project. */
  arrived: Accessor<boolean>
  state: () => Record<string, unknown> | undefined
  save: (state: Record<string, unknown>) => void
  open: () => void
}

/** Wire the one-shot flag to the dialog opener. Returns the effect disposer. */
export function createReopen(opts: ReopenOptions) {
  let done = false
  const run = () => {
    if (done || !opts.loaded() || !opts.arrived()) return
    const next = takeReopen(opts.state())
    if (!next.reopen) return
    done = true
    opts.save(next.state)
    opts.open()
  }
  createEffect(on([opts.loaded, opts.arrived], () => run(), { defer: true }))
  return run
}

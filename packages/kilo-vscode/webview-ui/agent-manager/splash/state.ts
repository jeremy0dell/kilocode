import { createSignal } from "solid-js"
import type { WebviewMessage } from "../../src/types/messages"

export interface SplashState {
  enabled: () => boolean
  setEnabled: (value: boolean) => void
  folded: () => boolean
  fold: () => void
  unfold: () => void
  start: () => void
}

export function createSplashState(
  post: (message: WebviewMessage) => void,
  initial: { enabled: boolean; folded: boolean },
): SplashState {
  const [enabled, setEnabled] = createSignal(initial.enabled)
  const [folded, setFolded] = createSignal(initial.folded)
  let started = false
  const save = (value: boolean) => {
    setFolded(value)
    post({ type: "agentManager.setSplashFolded", folded: value })
  }
  return {
    enabled,
    setEnabled,
    folded,
    fold: () => save(true),
    unfold: () => save(false),
    start: () => {
      if (!enabled() || started) return
      started = true
      if (!folded()) save(true)
    },
  }
}

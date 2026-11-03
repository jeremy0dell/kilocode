import { createSignal } from "solid-js"
import type { WebviewMessage } from "../../src/types/messages"

export interface SplashState {
  folded: () => boolean
  fold: () => void
  unfold: () => void
}

export function createSplashState(post: (message: WebviewMessage) => void, initial: { folded: boolean }): SplashState {
  const [folded, setFolded] = createSignal(initial.folded)
  const save = (value: boolean) => {
    setFolded(value)
    post({ type: "agentManager.setSplashFolded", folded: value })
  }
  return {
    folded,
    fold: () => save(true),
    unfold: () => save(false),
  }
}

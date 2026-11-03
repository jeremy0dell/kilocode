import { describe, expect, it } from "bun:test"
import { createRoot } from "solid-js"
import { createSplashState } from "../../webview-ui/agent-manager/splash/state"
import { visible, wrap } from "../../webview-ui/agent-manager/splash/selection"
import type { WebviewMessage } from "../../webview-ui/src/types/messages"

describe("Agent Manager splash persistence", () => {
  it("posts each fold change", () => {
    const posted: WebviewMessage[] = []
    createRoot((dispose) => {
      const splash = createSplashState((message) => posted.push(message), { folded: false })
      expect(splash.folded()).toBe(false)

      splash.fold()
      expect(splash.folded()).toBe(true)
      splash.unfold()
      expect(splash.folded()).toBe(false)
      dispose()
    })

    expect(posted).toEqual([
      { type: "agentManager.setSplashFolded", folded: true },
      { type: "agentManager.setSplashFolded", folded: false },
    ])
  })

  it("starts folded when the host restores a folded preference", () => {
    createRoot((dispose) => {
      const splash = createSplashState(() => {}, { folded: true })
      expect(splash.folded()).toBe(true)
      dispose()
    })
  })
})

describe("Agent Manager splash example carousel", () => {
  it("wraps arrow navigation around both ends", () => {
    expect(wrap(0, -1, 5)).toBe(4)
    expect(wrap(4, 1, 5)).toBe(0)
    expect(wrap(2, -1, 5)).toBe(1)
    expect(wrap(2, 1, 5)).toBe(3)
  })

  it("keeps three cards visible with the selected example in the window", () => {
    expect(visible(0, 5, 3)).toEqual([0, 1, 2])
    expect(visible(1, 5, 3)).toEqual([0, 1, 2])
    expect(visible(2, 5, 3)).toEqual([1, 2, 3])
    expect(visible(4, 5, 3)).toEqual([2, 3, 4])
  })
})

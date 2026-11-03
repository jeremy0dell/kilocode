import { describe, expect, it } from "bun:test"
import { folded } from "../../src/agent-manager/panel-preferences"
import { createSplashState } from "../../webview-ui/agent-manager/splash/state"
import { createRoot } from "solid-js"
import type { WebviewMessage } from "../../webview-ui/src/types/messages"

describe("Agent Manager host fold preference migration", () => {
  it.each([
    [undefined, undefined, undefined],
    [undefined, false, undefined],
    [undefined, true, true],
    [undefined, "true", undefined],
    ["false", true, true],
    [false, true, false],
    [true, false, true],
    [false, undefined, false],
    [true, undefined, true],
  ])("resolves saved %s and legacy %s to %s", (saved, legacy, expected) => {
    const values = new Map<string, unknown>([
      ["kilo.agentManager.splashFolded", saved],
      ["kilo.agentManager.introDismissed", legacy],
    ])
    const reads: string[] = []
    expect(
      folded({
        get<T>(key: string) {
          reads.push(key)
          return values.get(key) as T | undefined
        },
      }),
    ).toBe(expected)
    expect(reads).toEqual(
      typeof saved === "boolean"
        ? ["kilo.agentManager.splashFolded"]
        : ["kilo.agentManager.splashFolded", "kilo.agentManager.introDismissed"],
    )
  })

  it.each([
    [false, true, false, false],
    [true, false, true, true],
    [undefined, true, true, true],
    [undefined, undefined, false, true],
    [undefined, false, false, true],
  ])("preserves saved %s and legacy %s across first session and reload", (saved, legacy, before, after) => {
    const values = new Map<string, unknown>([
      ["kilo.agentManager.splashFolded", saved],
      ["kilo.agentManager.introDismissed", legacy],
    ])
    const state = { get: <T>(key: string) => values.get(key) as T | undefined }
    const posted: WebviewMessage[] = []
    for (const reload of [false, true]) {
      createRoot((dispose) => {
        const splash = createSplashState(
          (message) => {
            posted.push(message)
            if (message.type === "agentManager.setSplashFolded") {
              values.set("kilo.agentManager.splashFolded", message.folded)
            }
          },
          { folded: folded(state) },
        )
        expect(splash.folded()).toBe(reload ? after : before)
        splash.start()
        splash.start()
        expect(splash.folded()).toBe(after)
        dispose()
      })
    }
    expect(posted).toEqual(
      saved === undefined && legacy !== true ? [{ type: "agentManager.setSplashFolded", folded: true }] : [],
    )
  })
})

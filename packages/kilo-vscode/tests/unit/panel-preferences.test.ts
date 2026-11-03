import { describe, expect, it } from "bun:test"
import { folded } from "../../src/agent-manager/panel-preferences"

describe("Agent Manager host fold preference migration", () => {
  it.each([
    [undefined, undefined, false],
    [undefined, false, false],
    [undefined, true, true],
    [undefined, "true", false],
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
})

import { describe, expect, it } from "bun:test"
import { createRoot, createSignal, type Accessor } from "solid-js"
import { createReopen, markReopen, takeReopen } from "../../webview-ui/agent-manager/new-worktree-reopen"

function harness(start: Record<string, unknown> | undefined) {
  let state = start
  const [loaded, setLoaded] = createSignal(false)
  const [arrived, setArrived] = createSignal(false)
  let opens = 0
  let run = () => {}
  const dispose = createRoot((stop) => {
    run = createReopen({
      loaded,
      arrived,
      state: () => state,
      save: (next) => {
        state = next
      },
      open: () => {
        opens++
      },
    })
    return stop
  })
  return {
    loaded: loaded as Accessor<boolean>,
    arrived: arrived as Accessor<boolean>,
    setLoaded,
    setArrived,
    open: () => opens,
    run: () => run(),
    state: () => state,
    dispose,
  }
}

describe("New Worktree reopen flag", () => {
  it("keeps the draft and clears the flag when it was set", () => {
    const next = takeReopen({ advancedDialogReopen: true, advancedDialogDraft: { project: "p1" } })
    expect(next.reopen).toBe(true)
    expect(next.state).toEqual({ advancedDialogDraft: { project: "p1" } })
    expect(markReopen({ advancedDialogDraft: { project: "p1" } })).toEqual({
      advancedDialogDraft: { project: "p1" },
      advancedDialogReopen: true,
    })
  })

  it("does not report a normal reload", () => {
    const next = takeReopen({ advancedDialogDraft: { project: "p1" } })
    expect(next.reopen).toBe(false)
    expect(next.state).toEqual({ advancedDialogDraft: { project: "p1" } })
    expect(takeReopen(undefined)).toEqual({ reopen: false, state: {} })
  })

  it("opens once, only after the project list has arrived, and then clears the flag", () => {
    const setup = harness({ advancedDialogReopen: true, advancedDialogDraft: { project: "p1" } })
    try {
      setup.setArrived(true)
      setup.run()
      expect(setup.open()).toBe(0)
      setup.setLoaded(true)
      setup.run()
      expect(setup.open()).toBe(1)
      expect(setup.state()).toEqual({ advancedDialogDraft: { project: "p1" } })
      setup.setArrived(false)
      setup.setArrived(true)
      setup.setLoaded(false)
      setup.setLoaded(true)
      setup.run()
      expect(setup.open()).toBe(1)
    } finally {
      setup.dispose()
    }
  })

  it("leaves a normal reload closed", () => {
    const setup = harness({ advancedDialogDraft: { project: "p1" } })
    try {
      setup.setArrived(true)
      setup.setLoaded(true)
      setup.run()
      expect(setup.open()).toBe(0)
      expect(setup.state()).toEqual({ advancedDialogDraft: { project: "p1" } })
    } finally {
      setup.dispose()
    }
  })
})

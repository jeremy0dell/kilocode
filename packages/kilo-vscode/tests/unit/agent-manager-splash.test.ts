import { describe, expect, it } from "bun:test"
import { createRoot } from "solid-js"
import { createSplashState } from "../../webview-ui/agent-manager/splash/state"
import { splashView } from "../../webview-ui/agent-manager/splash/view"
import { isKnownRootSession, LOCAL } from "../../webview-ui/agent-manager/navigate"
import { backgroundCreated } from "../../webview-ui/agent-manager/project/local-tabs"
import { createProjectStore } from "../../webview-ui/agent-manager/project/store"
import type { ExtensionMessage, WebviewMessage } from "../../webview-ui/src/types/messages"

const source = await Bun.file(new URL("../../webview-ui/agent-manager/AgentManagerApp.tsx", import.meta.url)).text()

describe("Agent Manager splash gating", () => {
  it("falls back to the intro when the flag is off", () => {
    expect(splashView(false, false)).toBe("off")
    expect(splashView(false, true)).toBe("off")
  })

  it("shows the expanded splash on first open and the fold bar after hiding", () => {
    expect(splashView(true, false)).toBe("expanded")
    expect(splashView(true, true)).toBe("folded")
  })
})

describe("Agent Manager accepted session auto-fold boundary", () => {
  // Execute the real subscription, including guards, without mounting the entire application.
  const start = source.indexOf("    const unsubCreate = vscode.onMessage(")
  const end = source.indexOf("\n    // Mark sessions loaded", start)
  if (start < 0 || end < 0) throw new Error("Agent Manager sessionCreated subscription not found")
  const code = new Bun.Transpiler({ loader: "tsx" }).transformSync(source.slice(start, end))

  for (const kind of [
    "closed",
    "discarded",
    "removed",
    "duplicate",
    "echo",
    "child",
    "local",
    "worktree",
    "background",
  ]) {
    it(`${kind} session creation ${["local", "worktree", "background"].includes(kind) ? "folds" : "does not fold"}`, () => {
      createRoot((dispose) => {
        const posted: WebviewMessage[] = []
        const splash = createSplashState((message) => posted.push(message), { enabled: true })
        const scope = {
          vscode: {
            onMessage: (handler: (msg: ExtensionMessage) => void) => handler,
            postMessage: (message: WebviewMessage) => posted.push(message),
          },
          splash,
          isKnownRootSession,
          createdSessions: new Set(kind === "echo" ? ["session"] : []),
          closedDrafts: new Set(kind === "closed" ? ["draft"] : []),
          promotePendingDraftDiscard: () => kind === "discarded",
          registry: { all: () => [], ensure: () => createProjectStore("b") },
          currentProjectId: () => "a",
          projectList: () => [{ id: "a" }, { id: "b" }],
          backgroundCreated,
          localSessionIDs: () => (kind === "duplicate" ? ["session"] : []),
          worktreeSessionIds: () => new Set(kind === "worktree" ? ["session"] : []),
          activePendingId: () => undefined,
          selection: () => LOCAL,
          saveTabMemory: () => {},
          placeLocal: () => {},
          setSelection: () => {},
          session: { selectSession: () => {} },
          LOCAL,
        }
        const handle = new Function(...Object.keys(scope), `${code}\nreturn unsubCreate`)(...Object.values(scope)) as (
          msg: ExtensionMessage,
        ) => void
        handle({
          type: "sessionCreated",
          projectId: kind === "removed" ? "removed" : kind === "background" ? "b" : "a",
          draftID: kind === "closed" || kind === "discarded" ? "draft" : undefined,
          session: { id: "session", parentID: kind === "child" ? "parent" : null, createdAt: "", updatedAt: "" },
        })
        const accepted = ["local", "worktree", "background"].includes(kind)
        expect(splash.folded()).toBe(accepted)
        expect(posted.filter((message) => message.type === "agentManager.setSplashFolded")).toEqual(
          accepted ? [{ type: "agentManager.setSplashFolded", folded: true }] : [],
        )
        dispose()
      })
    })
  }
})

describe("Agent Manager splash persistence", () => {
  it("tracks the flag and posts each fold change", () => {
    const posted: WebviewMessage[] = []
    createRoot((dispose) => {
      const splash = createSplashState((message) => posted.push(message), { enabled: true })
      expect(splash.enabled()).toBe(true)
      expect(splash.folded()).toBe(false)

      splash.fold()
      expect(splash.folded()).toBe(true)
      splash.unfold()
      expect(splash.folded()).toBe(false)
      splash.setEnabled(false)
      expect(splash.enabled()).toBe(false)
      dispose()
    })

    expect(posted).toEqual([
      { type: "agentManager.setSplashFolded", folded: true },
      { type: "agentManager.setSplashFolded", folded: false },
    ])
  })

  it("starts folded when the host restores a folded preference", () => {
    createRoot((dispose) => {
      const splash = createSplashState(() => {}, { enabled: true, folded: true })
      expect(splash.folded()).toBe(true)
      dispose()
    })
  })

  it("persists auto-fold on the first session and permits reopening after it", () => {
    const posted: WebviewMessage[] = []
    createRoot((dispose) => {
      const splash = createSplashState((message) => posted.push(message), { enabled: true })
      splash.start()
      expect(splash.folded()).toBe(true)
      splash.start()
      expect(posted).toEqual([{ type: "agentManager.setSplashFolded", folded: true }])

      splash.unfold()
      splash.start()
      expect(splash.folded()).toBe(false)
      expect(posted).toEqual([
        { type: "agentManager.setSplashFolded", folded: true },
        { type: "agentManager.setSplashFolded", folded: false },
      ])
      dispose()
    })
  })

  it("does not auto-fold or persist anything while the flag is off", () => {
    const posted: WebviewMessage[] = []
    createRoot((dispose) => {
      const splash = createSplashState((message) => posted.push(message), { enabled: false })
      splash.start()
      expect(splash.folded()).toBe(false)
      expect(posted).toEqual([])

      splash.setEnabled(true)
      splash.start()
      expect(splash.folded()).toBe(true)
      expect(posted).toEqual([{ type: "agentManager.setSplashFolded", folded: true }])
      dispose()
    })
  })

  it("does not rewrite an already folded preference on session start", () => {
    const posted: WebviewMessage[] = []
    createRoot((dispose) => {
      const splash = createSplashState((message) => posted.push(message), { enabled: true, folded: true })
      splash.start()
      expect(splash.folded()).toBe(true)
      expect(posted).toEqual([])
      dispose()
    })
  })

  it("keeps Show examples expanded after reload and subsequent sessions", () => {
    const posted: WebviewMessage[] = []
    let preference: boolean | undefined
    createRoot((dispose) => {
      const splash = createSplashState(
        (message) => {
          if (message.type === "agentManager.setSplashFolded") preference = message.folded
        },
        { enabled: true },
      )
      splash.start()
      splash.unfold()
      expect(preference).toBe(false)
      dispose()
    })
    createRoot((dispose) => {
      const splash = createSplashState((message) => posted.push(message), { enabled: true, folded: preference })
      splash.start()
      expect(splash.folded()).toBe(false)
      expect(posted).toEqual([])
      dispose()
    })
  })

  it("does not auto-fold after explicit Hide and Show examples before any session starts", () => {
    const posted: WebviewMessage[] = []
    createRoot((dispose) => {
      const splash = createSplashState((message) => posted.push(message), { enabled: true })
      splash.fold()
      splash.unfold()
      splash.start()
      expect(splash.folded()).toBe(false)
      expect(posted).toHaveLength(2)
      dispose()
    })
  })
})

import { describe, expect, it } from "bun:test"
import { createRoot } from "solid-js"
import { createSplashState } from "../../webview-ui/agent-manager/splash/state"
import { splashView } from "../../webview-ui/agent-manager/splash/view"
import { start, wrap } from "../../webview-ui/agent-manager/splash/selection"
import { examples, type Anchor } from "../../webview-ui/agent-manager/splash/examples"
import type { WebviewMessage } from "../../webview-ui/src/types/messages"

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

describe("Agent Manager splash persistence", () => {
  it("tracks the flag and posts each fold change", () => {
    const posted: WebviewMessage[] = []
    createRoot((dispose) => {
      const splash = createSplashState((message) => posted.push(message), { enabled: true, folded: false })
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
})

describe("Agent Manager splash example carousel", () => {
  it("wraps arrow navigation around both ends", () => {
    expect(wrap(0, -1, 5)).toBe(4)
    expect(wrap(4, 1, 5)).toBe(0)
    expect(wrap(2, -1, 5)).toBe(1)
    expect(wrap(2, 1, 5)).toBe(3)
  })

  it("keeps three cards visible with the selected example in the window", () => {
    expect([0, 1, 2, 3, 4].map((index) => start(index, 5))).toEqual([0, 0, 1, 2, 2])
    expect(start(0, 2)).toBe(0)
  })
})

describe("Agent Manager splash feature anchors", () => {
  it("keeps the prototype's fixture rows in order", () => {
    expect(
      examples.map((example) =>
        example.fixture.projects.flatMap((project) =>
          project.rows.flatMap((row) =>
            row.kind === "session"
              ? row.session.title
              : row.kind === "section"
                ? [row.section.name, ...row.section.sessions.map((session) => session.title)]
                : row.kind === "versions"
                  ? row.sessions.map((session) => session.title)
                  : row.branch,
          ),
        ),
      ),
    ).toEqual([
      ["Usage billing: metering endpoint", "Usage billing: pricing page", "Usage billing: queue and alarms"],
      [
        "main",
        "ORCHESTRATE",
        "Orchestrator · scheduler latency pass",
        "PATCHES",
        "Reduce run-queue lock contention",
        "Batch io_uring submissions",
        "Pin hot kthreads to isolated cores",
      ],
      [
        "IMPLEMENT",
        "Rate-limit the login endpoint",
        "Paginate the audit log",
        "OPS",
        "Merge Captain",
        "Issue Delegator",
        "Adversarial Reviewer",
      ],
      ["main", "Cut cold start time · Kilo Auto", "Cut cold start time · Claude", "Cut cold start time · GPT"],
      [
        "main",
        "Logo direction · geometric",
        "Logo direction · wordmark",
        "Logo direction · monogram",
        "Color and type tokens",
        "Social card templates",
      ],
    ])
    expect(
      examples.map((example) => ({
        counts: example.fixture.projects.map((project) => project.count),
        shortcuts: example.fixture.projects.flatMap((project) =>
          project.rows.flatMap((row) => {
            const sessions =
              row.kind === "session"
                ? [row.session]
                : row.kind === "section"
                  ? row.section.sessions
                  : row.kind === "versions"
                    ? row.sessions
                    : []
            return sessions.map((session) => session.shortcut)
          }),
        ),
      })),
    ).toEqual([
      { counts: [3, 2, 2], shortcuts: [2, 3, 4] },
      { counts: [5], shortcuts: [2, 3, 4, 5] },
      { counts: [6], shortcuts: [2, 3, 4, 5, 6] },
      { counts: [4], shortcuts: [2, 3, 4] },
      { counts: [5], shortcuts: [2, 3, 4, 5, 6] },
    ])
  })

  it("resolves every typed anchor to exactly one fixture row", () => {
    for (const example of examples) {
      expect(example.features).toHaveLength(3)
      const resolve = (anchor: Anchor) => {
        const projects = example.fixture.projects.filter((project) => project.id === anchor.project)
        expect(projects).toHaveLength(1)
        const project = projects.at(0)!
        if (anchor.kind === "project") return projects
        if (anchor.kind === "section") {
          return project.rows.filter((row) => row.kind === "section" && row.section.id === anchor.section)
        }
        if (anchor.kind === "group") {
          return project.rows.filter((row) => row.kind === "versions" && row.id === anchor.group)
        }
        return project.rows
          .flatMap((row) =>
            row.kind === "session"
              ? [row.session]
              : row.kind === "section"
                ? row.section.sessions
                : row.kind === "versions"
                  ? row.sessions
                  : [],
          )
          .filter((session) => session.id === anchor.session)
      }
      for (const feature of example.features) expect(resolve(feature.anchor)).toHaveLength(1)
    }
  })

  it("targets the prototype's project, section, version group and sessions", () => {
    expect(examples.map((example) => example.features.map((feature) => feature.anchor))).toEqual([
      [
        { kind: "project", project: "billing-api" },
        { kind: "session", project: "billing-api", session: "usage-metering" },
        { kind: "session", project: "web-app", session: "pricing-page" },
      ],
      [
        { kind: "session", project: "kernel-sched", session: "orchestrator" },
        { kind: "session", project: "kernel-sched", session: "rq-lock" },
        { kind: "session", project: "kernel-sched", session: "kthread-pin" },
      ],
      [
        { kind: "session", project: "api", session: "merge-captain" },
        { kind: "section", project: "api", section: "implement" },
        { kind: "session", project: "api", session: "adversarial-reviewer" },
      ],
      [
        { kind: "group", project: "storefront", group: "cold-start" },
        { kind: "session", project: "storefront", session: "cold-start-a" },
        { kind: "session", project: "storefront", session: "cold-start-b" },
      ],
      [
        { kind: "group", project: "brand-kit", group: "logo" },
        { kind: "session", project: "brand-kit", session: "tokens" },
        { kind: "session", project: "brand-kit", session: "social-cards" },
      ],
    ])
  })
})

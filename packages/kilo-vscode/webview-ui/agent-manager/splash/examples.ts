import type { SECTION_COLORS } from "../section-colors"

type Status = "working" | "finished" | "needs-you"

type SectionColor = (typeof SECTION_COLORS)[number]["label"]

interface Session {
  id: string
  title: string
  branch?: string
  note?: string
  status?: Status
  pr?: number
  diff?: { additions: number; deletions: number }
  shortcut?: number
  selected?: boolean
}

interface Section {
  id: string
  name: string
  color: SectionColor
  sessions: readonly Session[]
}

type Row =
  | { kind: "local"; branch: string }
  | { kind: "session"; session: Session }
  | { kind: "section"; section: Section }
  | { kind: "versions"; id: string; sessions: readonly Session[] }

interface Project {
  id: string
  name: string
  count: number
  rows: readonly Row[]
}

interface Fixture {
  projects: readonly Project[]
}

export type Anchor =
  | { kind: "project"; project: string }
  | { kind: "section"; project: string; section: string }
  | { kind: "group"; project: string; group: string }
  | { kind: "session"; project: string; session: string }

interface Feature {
  name: string
  text: string
  anchor: Anchor
}

interface Example {
  id: "crossStack" | "orchestrator" | "ops" | "versions" | "beyondCode"
  tag: string
  title: string
  pitch: string
  features: readonly Feature[]
  fixture: Fixture
}

export const examples: readonly Example[] = [
  {
    id: "crossStack",
    tag: "agentManager.splash.examples.crossStack.tag",
    title: "agentManager.splash.examples.crossStack.title",
    pitch: "agentManager.splash.examples.crossStack.pitch",
    features: [
      {
        name: "agentManager.splash.examples.crossStack.feature1.name",
        text: "agentManager.splash.examples.crossStack.feature1.text",
        anchor: { kind: "project", project: "billing-api" },
      },
      {
        name: "agentManager.splash.examples.crossStack.feature2.name",
        text: "agentManager.splash.examples.crossStack.feature2.text",
        anchor: { kind: "session", project: "billing-api", session: "usage-metering" },
      },
      {
        name: "agentManager.splash.examples.crossStack.feature3.name",
        text: "agentManager.splash.examples.crossStack.feature3.text",
        anchor: { kind: "session", project: "web-app", session: "pricing-page" },
      },
    ],
    fixture: {
      projects: [
        {
          name: "billing-api",
          id: "billing-api",
          count: 3,
          rows: [
            {
              kind: "session",
              session: {
                title: "Usage billing: metering endpoint",
                id: "usage-metering",
                branch: "usage-metering",
                status: "working",
                shortcut: 2,
                diff: { additions: 142, deletions: 18 },
              },
            },
          ],
        },
        {
          name: "web-app",
          id: "web-app",
          count: 2,
          rows: [
            {
              kind: "session",
              session: {
                title: "Usage billing: pricing page",
                id: "pricing-page",
                branch: "pricing-page",
                status: "finished",
                pr: 889,
                shortcut: 3,
                selected: true,
              },
            },
          ],
        },
        {
          name: "infra",
          id: "infra",
          count: 2,
          rows: [
            {
              kind: "session",
              session: {
                title: "Usage billing: queue and alarms",
                id: "billing-queue",
                branch: "billing-queue",
                status: "needs-you",
                shortcut: 4,
                diff: { additions: 36, deletions: 4 },
              },
            },
          ],
        },
      ],
    },
  },
  {
    id: "orchestrator",
    tag: "agentManager.splash.examples.orchestrator.tag",
    title: "agentManager.splash.examples.orchestrator.title",
    pitch: "agentManager.splash.examples.orchestrator.pitch",
    features: [
      {
        name: "agentManager.splash.examples.orchestrator.feature1.name",
        text: "agentManager.splash.examples.orchestrator.feature1.text",
        anchor: { kind: "session", project: "kernel-sched", session: "orchestrator" },
      },
      {
        name: "agentManager.splash.examples.orchestrator.feature2.name",
        text: "agentManager.splash.examples.orchestrator.feature2.text",
        anchor: { kind: "session", project: "kernel-sched", session: "rq-lock" },
      },
      {
        name: "agentManager.splash.examples.orchestrator.feature3.name",
        text: "agentManager.splash.examples.orchestrator.feature3.text",
        anchor: { kind: "session", project: "kernel-sched", session: "kthread-pin" },
      },
    ],
    fixture: {
      projects: [
        {
          name: "kernel-sched",
          id: "kernel-sched",
          count: 5,
          rows: [
            { kind: "local", branch: "main" },
            {
              kind: "section",
              section: {
                name: "ORCHESTRATE",
                id: "orchestrate",
                color: "Purple",
                sessions: [
                  {
                    title: "Orchestrator · scheduler latency pass",
                    id: "orchestrator",
                    note: "started 3 sessions · 1 done",
                    status: "working",
                    shortcut: 2,
                  },
                ],
              },
            },
            {
              kind: "section",
              section: {
                name: "PATCHES",
                id: "patches",
                color: "Blue",
                sessions: [
                  {
                    title: "Reduce run-queue lock contention",
                    id: "rq-lock",
                    branch: "rq-lock",
                    status: "finished",
                    pr: 212,
                    shortcut: 3,
                  },
                  {
                    title: "Batch io_uring submissions",
                    id: "uring-batch",
                    branch: "uring-batch",
                    status: "working",
                    shortcut: 4,
                    diff: { additions: 58, deletions: 21 },
                  },
                  {
                    title: "Pin hot kthreads to isolated cores",
                    id: "kthread-pin",
                    branch: "kthread-pin",
                    status: "needs-you",
                    shortcut: 5,
                  },
                ],
              },
            },
          ],
        },
      ],
    },
  },
  {
    id: "ops",
    tag: "agentManager.splash.examples.ops.tag",
    title: "agentManager.splash.examples.ops.title",
    pitch: "agentManager.splash.examples.ops.pitch",
    features: [
      {
        name: "agentManager.splash.examples.ops.feature1.name",
        text: "agentManager.splash.examples.ops.feature1.text",
        anchor: { kind: "session", project: "api", session: "merge-captain" },
      },
      {
        name: "agentManager.splash.examples.ops.feature2.name",
        text: "agentManager.splash.examples.ops.feature2.text",
        anchor: { kind: "section", project: "api", section: "implement" },
      },
      {
        name: "agentManager.splash.examples.ops.feature3.name",
        text: "agentManager.splash.examples.ops.feature3.text",
        anchor: { kind: "session", project: "api", session: "adversarial-reviewer" },
      },
    ],
    fixture: {
      projects: [
        {
          name: "api",
          id: "api",
          count: 6,
          rows: [
            {
              kind: "section",
              section: {
                name: "IMPLEMENT",
                id: "implement",
                color: "Blue",
                sessions: [
                  {
                    title: "Rate-limit the login endpoint",
                    id: "rate-limit-login",
                    branch: "rate-limit-login",
                    status: "finished",
                    pr: 412,
                    shortcut: 2,
                  },
                  {
                    title: "Paginate the audit log",
                    id: "audit-pagination",
                    branch: "audit-pagination",
                    status: "working",
                    shortcut: 3,
                    diff: { additions: 88, deletions: 12 },
                  },
                ],
              },
            },
            {
              kind: "section",
              section: {
                name: "OPS",
                id: "ops",
                color: "Green",
                sessions: [
                  {
                    title: "Merge Captain",
                    id: "merge-captain",
                    note: "queue: #412, #414",
                    status: "working",
                    shortcut: 4,
                  },
                  {
                    title: "Issue Delegator",
                    id: "issue-delegator",
                    note: "triaged 6 issues",
                    status: "finished",
                    shortcut: 5,
                  },
                  {
                    title: "Adversarial Reviewer",
                    id: "adversarial-reviewer",
                    note: "objection on #414",
                    status: "needs-you",
                    shortcut: 6,
                    selected: true,
                  },
                ],
              },
            },
          ],
        },
      ],
    },
  },
  {
    id: "versions",
    tag: "agentManager.splash.examples.versions.tag",
    title: "agentManager.splash.examples.versions.title",
    pitch: "agentManager.splash.examples.versions.pitch",
    features: [
      {
        name: "agentManager.splash.examples.versions.feature1.name",
        text: "agentManager.splash.examples.versions.feature1.text",
        anchor: { kind: "group", project: "storefront", group: "cold-start" },
      },
      {
        name: "agentManager.splash.examples.versions.feature2.name",
        text: "agentManager.splash.examples.versions.feature2.text",
        anchor: { kind: "session", project: "storefront", session: "cold-start-a" },
      },
      {
        name: "agentManager.splash.examples.versions.feature3.name",
        text: "agentManager.splash.examples.versions.feature3.text",
        anchor: { kind: "session", project: "storefront", session: "cold-start-b" },
      },
    ],
    fixture: {
      projects: [
        {
          name: "storefront",
          id: "storefront",
          count: 4,
          rows: [
            { kind: "local", branch: "main" },
            {
              kind: "versions",
              id: "cold-start",
              sessions: [
                {
                  title: "Cut cold start time · Kilo Auto",
                  id: "cold-start-a",
                  branch: "cold-start-a",
                  status: "finished",
                  shortcut: 2,
                  diff: { additions: 64, deletions: 40 },
                },
                {
                  title: "Cut cold start time · Claude",
                  id: "cold-start-b",
                  branch: "cold-start-b",
                  status: "finished",
                  pr: 58,
                  shortcut: 3,
                  selected: true,
                },
                {
                  title: "Cut cold start time · GPT",
                  id: "cold-start-c",
                  branch: "cold-start-c",
                  status: "working",
                  shortcut: 4,
                  diff: { additions: 21, deletions: 9 },
                },
              ],
            },
          ],
        },
      ],
    },
  },
  {
    id: "beyondCode",
    tag: "agentManager.splash.examples.beyondCode.tag",
    title: "agentManager.splash.examples.beyondCode.title",
    pitch: "agentManager.splash.examples.beyondCode.pitch",
    features: [
      {
        name: "agentManager.splash.examples.beyondCode.feature1.name",
        text: "agentManager.splash.examples.beyondCode.feature1.text",
        anchor: { kind: "group", project: "brand-kit", group: "logo" },
      },
      {
        name: "agentManager.splash.examples.beyondCode.feature2.name",
        text: "agentManager.splash.examples.beyondCode.feature2.text",
        anchor: { kind: "session", project: "brand-kit", session: "tokens" },
      },
      {
        name: "agentManager.splash.examples.beyondCode.feature3.name",
        text: "agentManager.splash.examples.beyondCode.feature3.text",
        anchor: { kind: "session", project: "brand-kit", session: "social-cards" },
      },
    ],
    fixture: {
      projects: [
        {
          name: "brand-kit",
          id: "brand-kit",
          count: 5,
          rows: [
            { kind: "local", branch: "main" },
            {
              kind: "versions",
              id: "logo",
              sessions: [
                {
                  title: "Logo direction · geometric",
                  id: "logo-geo",
                  branch: "logo-geo",
                  status: "finished",
                  shortcut: 2,
                },
                {
                  title: "Logo direction · wordmark",
                  id: "logo-word",
                  branch: "logo-word",
                  status: "finished",
                  shortcut: 3,
                  selected: true,
                },
                {
                  title: "Logo direction · monogram",
                  id: "logo-mono",
                  branch: "logo-mono",
                  status: "needs-you",
                  shortcut: 4,
                },
              ],
            },
            {
              kind: "session",
              session: {
                title: "Color and type tokens",
                id: "tokens",
                branch: "tokens",
                status: "working",
                shortcut: 5,
              },
            },
            {
              kind: "session",
              session: {
                title: "Social card templates",
                id: "social-cards",
                branch: "social-cards",
                shortcut: 6,
              },
            },
          ],
        },
      ],
    },
  },
]

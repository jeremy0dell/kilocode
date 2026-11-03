type Status = "working" | "finished" | "needs-you"

type SectionColor = "Red" | "Orange" | "Yellow" | "Green" | "Cyan" | "Blue" | "Purple" | "Magenta"

export interface Session {
  title: string
  branch?: string
  note?: string
  status?: Status
  pr?: number
  diff?: { additions: number; deletions: number }
  selected?: boolean
}

interface Section {
  name: string
  color: SectionColor
  sessions: readonly Session[]
}

type Row =
  | { kind: "local"; branch: string }
  | { kind: "session"; session: Session }
  | { kind: "section"; section: Section }
  | { kind: "versions"; sessions: readonly Session[] }

interface Project {
  name: string
  rows: readonly Row[]
}

interface Fixture {
  projects: readonly Project[]
}

interface Feature {
  name: string
  text: string
}

export interface Example {
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
      },
      {
        name: "agentManager.splash.examples.crossStack.feature2.name",
        text: "agentManager.splash.examples.crossStack.feature2.text",
      },
      {
        name: "agentManager.splash.examples.crossStack.feature3.name",
        text: "agentManager.splash.examples.crossStack.feature3.text",
      },
    ],
    fixture: {
      projects: [
        {
          name: "billing-api",
          rows: [
            {
              kind: "session",
              session: {
                title: "Usage billing: metering endpoint",
                branch: "usage-metering",
                status: "working",
                diff: { additions: 142, deletions: 18 },
              },
            },
          ],
        },
        {
          name: "web-app",
          rows: [
            {
              kind: "session",
              session: {
                title: "Usage billing: pricing page",
                branch: "pricing-page",
                status: "finished",
                pr: 889,
                selected: true,
              },
            },
          ],
        },
        {
          name: "infra",
          rows: [
            {
              kind: "session",
              session: {
                title: "Usage billing: queue and alarms",
                branch: "billing-queue",
                status: "needs-you",
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
      },
      {
        name: "agentManager.splash.examples.orchestrator.feature2.name",
        text: "agentManager.splash.examples.orchestrator.feature2.text",
      },
      {
        name: "agentManager.splash.examples.orchestrator.feature3.name",
        text: "agentManager.splash.examples.orchestrator.feature3.text",
      },
    ],
    fixture: {
      projects: [
        {
          name: "kernel-sched",
          rows: [
            { kind: "local", branch: "main" },
            {
              kind: "section",
              section: {
                name: "ORCHESTRATE",
                color: "Purple",
                sessions: [
                  {
                    title: "Orchestrator · scheduler latency pass",
                    note: "started 3 sessions · 1 done",
                    status: "working",
                    selected: true,
                  },
                ],
              },
            },
            {
              kind: "section",
              section: {
                name: "PATCHES",
                color: "Blue",
                sessions: [
                  {
                    title: "Reduce run-queue lock contention",
                    branch: "rq-lock",
                    status: "finished",
                    pr: 212,
                  },
                  {
                    title: "Batch io_uring submissions",
                    branch: "uring-batch",
                    status: "working",
                    diff: { additions: 58, deletions: 21 },
                  },
                  {
                    title: "Pin hot kthreads to isolated cores",
                    branch: "kthread-pin",
                    status: "needs-you",
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
      },
      {
        name: "agentManager.splash.examples.ops.feature2.name",
        text: "agentManager.splash.examples.ops.feature2.text",
      },
      {
        name: "agentManager.splash.examples.ops.feature3.name",
        text: "agentManager.splash.examples.ops.feature3.text",
      },
    ],
    fixture: {
      projects: [
        {
          name: "api",
          rows: [
            {
              kind: "section",
              section: {
                name: "IMPLEMENT",
                color: "Blue",
                sessions: [
                  {
                    title: "Rate-limit the login endpoint",
                    branch: "rate-limit-login",
                    status: "finished",
                    pr: 412,
                  },
                  {
                    title: "Paginate the audit log",
                    branch: "audit-pagination",
                    status: "working",
                    diff: { additions: 88, deletions: 12 },
                  },
                  {
                    title: "Retry failed webhooks",
                    branch: "webhook-retries",
                    status: "finished",
                    pr: 414,
                  },
                ],
              },
            },
            {
              kind: "section",
              section: {
                name: "OPS",
                color: "Green",
                sessions: [
                  {
                    title: "Merge Captain",
                    note: "queue: #412, #414",
                    status: "working",
                  },
                  {
                    title: "Issue Delegator",
                    note: "triaged 6 issues",
                    status: "finished",
                  },
                  {
                    title: "Adversarial Reviewer",
                    note: "objection on #414",
                    status: "needs-you",
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
      },
      {
        name: "agentManager.splash.examples.versions.feature2.name",
        text: "agentManager.splash.examples.versions.feature2.text",
      },
      {
        name: "agentManager.splash.examples.versions.feature3.name",
        text: "agentManager.splash.examples.versions.feature3.text",
      },
    ],
    fixture: {
      projects: [
        {
          name: "storefront",
          rows: [
            { kind: "local", branch: "main" },
            {
              kind: "versions",
              sessions: [
                {
                  title: "Cut cold start time · Kilo Auto",
                  branch: "cold-start-a",
                  status: "finished",
                  diff: { additions: 64, deletions: 40 },
                },
                {
                  title: "Cut cold start time · Claude",
                  branch: "cold-start-b",
                  status: "finished",
                  pr: 58,
                  selected: true,
                },
                {
                  title: "Cut cold start time · GPT",
                  branch: "cold-start-c",
                  status: "working",
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
      },
      {
        name: "agentManager.splash.examples.beyondCode.feature2.name",
        text: "agentManager.splash.examples.beyondCode.feature2.text",
      },
      {
        name: "agentManager.splash.examples.beyondCode.feature3.name",
        text: "agentManager.splash.examples.beyondCode.feature3.text",
      },
    ],
    fixture: {
      projects: [
        {
          name: "brand-kit",
          rows: [
            { kind: "local", branch: "main" },
            {
              kind: "versions",
              sessions: [
                {
                  title: "Logo direction · geometric",
                  branch: "logo-geo",
                  status: "finished",
                },
                {
                  title: "Logo direction · wordmark",
                  branch: "logo-word",
                  status: "finished",
                  selected: true,
                },
                {
                  title: "Logo direction · monogram",
                  branch: "logo-mono",
                  status: "needs-you",
                },
              ],
            },
            {
              kind: "session",
              session: {
                title: "Color and type tokens",
                branch: "tokens",
                status: "working",
              },
            },
            {
              kind: "session",
              session: {
                title: "Social card templates",
                branch: "social-cards",
              },
            },
          ],
        },
      ],
    },
  },
]

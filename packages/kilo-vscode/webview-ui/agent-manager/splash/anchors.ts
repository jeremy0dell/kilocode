import type { Example } from "./examples"

// Temporary content descriptors until PR2 supplies Feature["anchor"].
export type Anchor =
  | { kind: "project"; project: string }
  | { kind: "section"; project: string; section: string }
  | { kind: "group"; project: string; group: string }
  | { kind: "session"; project: string; session: string }

export const anchors: Record<Example["id"], readonly Anchor[]> = {
  crossStack: [
    { kind: "project", project: "billing-api" },
    { kind: "session", project: "billing-api", session: "usage-metering" },
    { kind: "session", project: "web-app", session: "pricing-page" },
  ],
  orchestrator: [
    { kind: "session", project: "kernel-sched", session: "orchestrator" },
    { kind: "session", project: "kernel-sched", session: "rq-lock" },
    { kind: "session", project: "kernel-sched", session: "kthread-pin" },
  ],
  ops: [
    { kind: "session", project: "api", session: "merge-captain" },
    { kind: "section", project: "api", section: "implement" },
    { kind: "session", project: "api", session: "adversarial-reviewer" },
  ],
  versions: [
    { kind: "group", project: "storefront", group: "cold-start" },
    { kind: "session", project: "storefront", session: "cold-start-a" },
    { kind: "session", project: "storefront", session: "cold-start-b" },
  ],
  beyondCode: [
    { kind: "group", project: "brand-kit", group: "logo" },
    { kind: "session", project: "brand-kit", session: "tokens" },
    { kind: "session", project: "brand-kit", session: "social-cards" },
  ],
}

// Temporary fixture aliases disappear when PR2 supplies explicit content ids.
export const aliases: Record<string, string> = {
  "Orchestrator · scheduler latency pass": "orchestrator",
  "Merge Captain": "merge-captain",
  "Issue Delegator": "issue-delegator",
  "Adversarial Reviewer": "adversarial-reviewer",
  "cold-start-a": "cold-start",
  "logo-geo": "logo",
}

import type { Example } from "./examples"
import type { fleet } from "./fleet"

/** Resolve content identities to existing shared sidebar DOM, never translated text or row coordinates. */
export function anchor(
  root: HTMLElement,
  rows: ReturnType<typeof fleet>,
  target: Example["features"][number]["anchor"],
): HTMLElement | undefined {
  const row = rows.find((row) => row.project.root === target.project)
  if (!row) return
  const project = [...root.querySelectorAll<HTMLElement>("[data-sidebar-id]")]
    .find((el) => el.dataset.sidebarId === `${row.project.id}:local`)
    ?.closest<HTMLElement>(".am-project")
  if (!project) return
  if (target.kind === "project") return project.querySelector<HTMLElement>(".am-project-item") ?? undefined
  if (target.kind === "section") {
    const section = row.state.sections?.find((section) => section.id === `${row.project.id}:section:${target.section}`)
    return [...project.querySelectorAll<HTMLElement>(".am-section-group-header")].find(
      (el) => el.querySelector("[aria-label]")?.getAttribute("aria-label") === section?.name,
    )
  }
  const worktree = row.state.worktrees.find((wt) =>
    target.kind === "session"
      ? wt.id === `${row.project.id}:worktree:${target.session}`
      : wt.groupId === `${row.project.id}:group:${target.group}`,
  )
  if (!worktree) return
  const item = [...project.querySelectorAll<HTMLElement>("[data-sidebar-id]")].find(
    (el) => el.dataset.sidebarId === `${row.project.id}:${worktree.id}`,
  )
  if (target.kind === "session") return item
  return item?.closest(".am-worktree-exit")?.querySelector<HTMLElement>(".am-wt-group-header") ?? undefined
}

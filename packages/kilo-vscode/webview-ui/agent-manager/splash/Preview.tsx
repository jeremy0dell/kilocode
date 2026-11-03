import { For, onCleanup, onMount, type Accessor } from "solid-js"
import { useLanguage } from "../../src/context/language"
import { ProjectsSection } from "../ProjectsSection"
import { ProjectSidebarBody } from "../ProjectSidebarBody"
import { createProjectStore } from "../project/store"
import { buildProjectNavEntries } from "../project-nav"
import { buildShortcutMap } from "../section-helpers"
import type { WorktreeDelete } from "../worktree-delete"
import { examples, type Example } from "./examples"
import { fleet } from "./fleet"
import { guard } from "./guard"

const noop = () => undefined
const deletion: WorktreeDelete = { pending: noop, cancel: noop, confirm: noop, select: noop }

function Fleet(props: { example: Example }) {
  const { t } = useLanguage()
  const rows = fleet(props.example).map((row) => {
    const store = createProjectStore(row.project.id)
    store.applyState(row.state)
    return { ...row, store }
  })
  const projects = rows.map((row) => row.project)
  const states = Object.fromEntries(rows.map((row) => [row.project.id, row.state]))
  const shortcuts = buildShortcutMap(buildProjectNavEntries(projects, states))
  return (
    <ProjectsSection
      projects={projects}
      t={t}
      bindings={{}}
      onAdd={noop}
      onCreateProject={noop}
      onClone={noop}
      onSelect={noop}
      onRemove={noop}
      onExpand={noop}
      onReorder={noop}
      onHistory={noop}
      onNew={noop}
      onCreate={noop}
      onSection={noop}
      onSettings={noop}
      count={(id) => states[id]!.worktrees.length + 1}
      baseBranch={(id) => rows.find((row) => row.project.id === id)?.local.branch ?? "main"}
      body={(project) => {
        const row = rows.find((item) => item.project.id === project.id)!
        return (
          <ProjectSidebarBody
            project={project}
            state={row.state}
            store={row.store}
            deletion={deletion}
            busy={() => false}
            blocked={() => false}
            activityFor={(id) => (id === null ? "idle" : (row.activity[id] ?? "idle"))}
            stats={row.stats}
            local={row.local}
            prs={row.prs}
            selectedProject={row.selection ? project.id : undefined}
            selection={row.selection}
            bindings={{}}
            t={t}
            onSelectLocal={noop}
            onSelectWorktree={noop}
            onOpenComments={noop}
            onOpenPR={noop}
            onCreateSection={noop}
            renamingSection={noop}
            onRenameEnd={noop}
            shortcutMap={() => shortcuts}
          />
        )
      }}
    />
  )
}

export function SidebarPreview(props: { selected: Accessor<number>; example?: number }) {
  const { t } = useLanguage()
  return (
    <div class="am-splash-preview-card" role="figure" aria-label={t("agentManager.splash.preview.label")}>
      <div aria-hidden="true" class="am-splash-preview-stack" ref={(el) => onMount(() => onCleanup(guard(el)))}>
        <For each={props.example == null ? examples : examples.filter((_, index) => index === props.example)}>
          {(example, index) => (
            <div
              class="am-splash-preview-panel"
              classList={{ "am-splash-preview-panel-active": (props.example ?? index()) === props.selected() }}
              aria-hidden={(props.example ?? index()) !== props.selected() ? "true" : undefined}
            >
              <Fleet example={example} />
            </div>
          )}
        </For>
      </div>
    </div>
  )
}

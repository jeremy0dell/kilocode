import { For, Show, createEffect, createSignal, createUniqueId, on, onCleanup, onMount, type Accessor } from "solid-js"
import { Icon } from "@kilocode/kilo-ui/icon"
import { ActivityIcon } from "../../src/components/shared/ActivityIcon"
import { label } from "../../src/utils/session-activity"
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
import { anchor } from "./anchor"
import { wrap } from "./selection"
import { SplashPopover } from "./Popover"

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
      tools={<Icon name="magnifying-glass" size="small" />}
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

export function SidebarPreview(props: {
  selected: Accessor<number>
  highlight: Accessor<number | undefined>
  onHighlight: (index: number | undefined) => void
}) {
  const { t } = useLanguage()
  const id = createUniqueId()
  const current = () => examples.at(props.selected()) ?? examples.at(0)!
  const [positions, setPositions] = createSignal<{ left: number; top: number; visible: boolean }[]>([])
  const [thin, setThin] = createSignal(false)
  const [open, setOpen] = createSignal<number>()
  let container!: HTMLDivElement
  let card!: HTMLDivElement
  let stack!: HTMLDivElement
  const panel = () => stack.querySelector<HTMLElement>(".am-splash-preview-panel-active")
  const target = (index: number) => {
    const root = panel()
    const feature = current().features.at(index)
    return root && feature ? anchor(root, fleet(current()), feature.anchor) : undefined
  }
  const measure = (index?: number, fit = true) => {
    const root = panel()
    if (!root) return
    const rows = fleet(current())
    const targets = current().features.map((feature) => anchor(root, rows, feature.anchor))
    const list = root.querySelector<HTMLElement>(".am-projects-list")
    if (!list) return
    const bounds = list.getBoundingClientRect()
    const first = targets
      .filter((target) => target !== undefined)
      .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)
      .at(0)
    const inset = first?.matches(".am-project-item")
      ? 0
      : (first?.closest(".am-project")?.querySelector(".am-project-item")?.getBoundingClientRect().height ?? 0)
    const rects = targets.flatMap((target) => (target ? [target.getBoundingClientRect()] : []))
    const top = Math.min(...rects.map((rect) => rect.top))
    const bottom = Math.max(...rects.map((rect) => rect.bottom))
    const fits = bottom - top <= bounds.height - 28 - inset
    if (fit && fits) {
      // Account for the real sticky project header, including when a section/group is the first anchor.
      list.scrollTop += Math.max(bottom - bounds.bottom + 28, Math.min(0, top - bounds.top - inset))
    }
    const target = index === undefined ? undefined : targets.at(index)
    if (target && !fits) {
      const chrome = target.closest(".am-project")?.querySelector(".am-project-item")?.getBoundingClientRect()
      const min = target.matches(".am-project-item") ? bounds.top : Math.max(bounds.top, chrome?.bottom ?? 0)
      const rect = target.getBoundingClientRect()
      list.scrollTop += Math.max(rect.bottom - bounds.bottom + 28, Math.min(0, rect.top - min))
    }
    const rect = card.getBoundingClientRect()
    const box = { left: rect.left + card.clientLeft, top: rect.top + card.clientTop }
    const rtl = getComputedStyle(card).direction === "rtl"
    const ordered = targets
      .map((target, index) => ({ index, top: target?.getBoundingClientRect().top ?? 0 }))
      .sort((a, b) => a.top - b.top)
    setPositions(
      targets.map((target, index) => {
        if (!target) return { left: 0, top: 0, visible: false }
        const rect = target.getBoundingClientRect()
        const meta = target
          .querySelector<HTMLElement>(".am-wt-actions-cell, .am-sidebar-header-actions, .am-sidebar-header-count")
          ?.getBoundingClientRect()
        const top = rect.top - box.top + (rect.height - 16) / 2
        const rank = ordered.findIndex((item) => item.index === index)
        const chrome = target.closest(".am-project")?.querySelector(".am-project-item")?.getBoundingClientRect()
        const min = Math.max(bounds.top, chrome?.bottom ?? 0) - box.top + 4
        const max = bounds.bottom - box.top - 44
        const visible =
          rect.top >= bounds.top &&
          rect.bottom <= bounds.bottom - 28 &&
          (target.matches(".am-project-item") || rect.top >= (chrome?.bottom ?? 0))
        return {
          left: rtl ? (meta?.right ?? rect.left + 8) - box.left + 8 : (meta?.left ?? rect.right - 8) - box.left - 24,
          // Only offscreen markers move to the edge; activation scrolls their real row above the fade.
          top: visible
            ? top
            : Math.max(min, Math.min(max, top < min ? min + rank * 24 : max - (targets.length - 1 - rank) * 24)),
          visible: true,
        }
      }),
    )
  }
  const select = (index: number | undefined) => {
    if (thin()) setOpen(index)
    if (!thin()) props.onHighlight(index)
    measure(index)
  }
  onMount(() => {
    const dispose = guard(stack)
    const observer = new ResizeObserver(() => {
      setThin(getComputedStyle(card).getPropertyValue("--am-splash-mode").trim() === "thin")
      measure(thin() ? open() : props.highlight())
    })
    observer.observe(card)
    for (const root of stack.querySelectorAll<HTMLElement>(".am-projects-list")) {
      observer.observe(root)
    }
    stack.addEventListener("scroll", measureScroll, true)
    let alive = true
    void document.fonts.ready.then(() => {
      if (alive) measure(props.highlight())
    })
    onCleanup(() => {
      alive = false
      dispose()
      observer.disconnect()
      stack.removeEventListener("scroll", measureScroll, true)
    })
    measure(undefined, true)
  })
  const measureScroll = () => measure(undefined, false)
  createEffect(
    on(props.selected, () => {
      props.onHighlight(undefined)
      panel()?.querySelector<HTMLElement>(".am-projects-list")?.scrollTo({ top: 0 })
      measure(undefined, true)
    }),
  )
  createEffect(on(props.highlight, (index) => measure(index)))
  createEffect(
    on([props.selected, thin], () => {
      setOpen(thin() ? 0 : undefined)
      props.onHighlight(undefined)
      measure(thin() ? 0 : undefined)
    }),
  )
  return (
    <div ref={container} class="am-splash-preview" data-tone={current().id}>
      <div ref={card} class="am-splash-preview-card" role="figure" aria-label={t("agentManager.splash.preview.label")}>
        <div aria-hidden="true" class="am-splash-preview-stack" ref={stack}>
          <For each={examples}>
            {(example, index) => (
              <Show when={index() === props.selected()}>
                <div
                  class="am-splash-preview-panel"
                  classList={{ "am-splash-preview-panel-active": index() === props.selected() }}
                  aria-hidden={index() !== props.selected() ? "true" : undefined}
                >
                  <Fleet example={example} />
                </div>
              </Show>
            )}
          </For>
        </div>
        <For each={current().features}>
          {(feature, index) => (
            <button
              type="button"
              class="am-splash-marker"
              classList={{ "am-splash-marker-highlight": (thin() ? open() : props.highlight()) === index() }}
              style={{
                left: `${positions().at(index())?.left ?? 0}px`,
                top: `${positions().at(index())?.top ?? 0}px`,
                visibility: positions().at(index())?.visible ? "visible" : "hidden",
              }}
              aria-label={t("agentManager.splash.marker", { number: index() + 1, name: t(feature.name) })}
              aria-pressed={thin() ? undefined : props.highlight() === index()}
              aria-expanded={thin() ? open() === index() : undefined}
              aria-controls={thin() ? id : undefined}
              onClick={() => select((thin() ? open() : props.highlight()) === index() ? undefined : index())}
              onFocus={(event) => {
                if (event.currentTarget.matches(":focus-visible")) measure(index())
              }}
              onKeyDown={(event) => {
                if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
                const delta = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key]
                if (!delta) return
                event.preventDefault()
                const next = wrap(index(), delta, current().features.length)
                select(next)
                card.querySelectorAll<HTMLButtonElement>(".am-splash-marker").item(next)?.focus({ preventScroll: true })
              }}
            >
              {index() + 1}
            </button>
          )}
        </For>
      </div>
      <SplashPopover
        id={id}
        features={current().features.map((feature) => ({ name: t(feature.name), text: t(feature.text) }))}
        selected={open() ?? 0}
        open={thin() && open() !== undefined}
        onSelect={(index) => {
          select(index)
          card.querySelectorAll<HTMLButtonElement>(".am-splash-marker").item(index)?.focus({ preventScroll: true })
        }}
        onClose={() => setOpen(undefined)}
        anchor={(index) => target(index)?.getBoundingClientRect()}
        markers={() => {
          measure(undefined, false)
          return [...card.querySelectorAll(".am-splash-marker")].map((marker) => marker.getBoundingClientRect())
        }}
        frame={() => card}
        rows={() => panel()?.querySelector<HTMLElement>(".am-projects-list") ?? undefined}
        container={() => container}
        previousLabel={t("agentManager.splash.carousel.previous")}
        nextLabel={t("agentManager.splash.carousel.next")}
      />
      <div class="am-splash-legend" aria-hidden="true">
        <For each={["busy", "done", "waiting"] as const}>
          {(state) => (
            <span>
              <span class="am-wt-icon" data-activity={state}>
                <ActivityIcon state={state} />
              </span>
              {t(label(state))}
            </span>
          )}
        </For>
      </div>
    </div>
  )
}

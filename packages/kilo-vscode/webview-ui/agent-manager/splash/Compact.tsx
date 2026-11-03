import { For, Show, createEffect, createUniqueId, onMount, onCleanup, type Accessor, type JSX } from "solid-js"
import { Button } from "@kilocode/kilo-ui/button"
import { useLanguage } from "../../src/context/language"
import { examples } from "./examples"
import { Framing } from "./fleet"
import { SidebarPreview } from "./Preview"
import { wrap } from "./selection"

export function Compact(props: { selected: Accessor<number>; onSelect: (index: number) => void }) {
  const { t } = useLanguage()
  const id = createUniqueId()
  const tabs: HTMLButtonElement[] = []
  createEffect(() => tabs.at(props.selected())?.scrollIntoView({ block: "nearest", inline: "nearest" }))
  const frame = (root: HTMLDivElement, example: (typeof examples)[number]) => {
    onMount(() => {
      let pending = 0
      const anchor = () => {
        const panel = root.querySelector(".am-splash-preview-panel-active")
        const selected = panel?.querySelector(".am-worktree-item-active")
        if (!selected) return
        const group =
          selected.closest(".am-section-group")?.querySelector(".am-section-group-header") ??
          panel?.querySelector(".am-wt-group-header") ??
          selected.closest(".am-project")?.querySelector(".am-project-item")
        const target =
          example.id === "crossStack"
            ? panel?.querySelector('[data-activity="waiting"]')?.closest(".am-worktree-item")
            : example.id === "ops"
              ? panel?.querySelector(".am-section-group-header")
              : example.id === "beyondCode"
                ? selected
                : group
        root.scrollTop += (target ?? selected).getBoundingClientRect().top - root.getBoundingClientRect().top - 1
      }
      const schedule = () => {
        cancelAnimationFrame(pending)
        pending = requestAnimationFrame(anchor)
      }
      const observer = new ResizeObserver(schedule)
      observer.observe(root)
      const panel = root.querySelector(".am-splash-preview-panel-active")
      if (panel) observer.observe(panel)
      // Force the initial layout and anchor before the new subtree's first paint.
      anchor()
      onCleanup(() => {
        observer.disconnect()
        cancelAnimationFrame(pending)
      })
    })
  }
  return (
    <div class="am-splash-compact">
      <div
        class="am-splash-tabs"
        role="tablist"
        aria-orientation="horizontal"
        aria-label={t("agentManager.splash.eyebrow")}
      >
        <For each={examples}>
          {(example, index) => (
            <Button
              ref={(node: HTMLButtonElement) => {
                tabs[index()] = node
              }}
              variant="ghost"
              size="small"
              class="am-splash-tab"
              data-tone={example.id}
              role="tab"
              id={`${id}-tab-${index()}`}
              aria-controls={`${id}-panel-${index()}`}
              aria-selected={index() === props.selected()}
              tabIndex={index() === props.selected() ? 0 : -1}
              onClick={() => props.onSelect(index())}
              onKeyDown={(event: Parameters<JSX.EventHandler<HTMLButtonElement, KeyboardEvent>>[0]) => {
                const rtl = getComputedStyle(event.currentTarget).direction === "rtl"
                const next =
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? examples.length - 1
                      : event.key === "ArrowRight"
                        ? wrap(index(), rtl ? -1 : 1, examples.length)
                        : event.key === "ArrowLeft"
                          ? wrap(index(), rtl ? 1 : -1, examples.length)
                          : undefined
                if (next == null) return
                event.preventDefault()
                props.onSelect(next)
                tabs.at(next)?.focus({ preventScroll: true })
              }}
            >
              <span class="am-splash-tab-dot" aria-hidden="true" />
              {t(example.tag)}
            </Button>
          )}
        </For>
      </div>
      <div class="am-splash-compact-panels">
        <For each={examples}>
          {(example, index) => (
            <div
              class="am-splash-compact-panel"
              classList={{ "am-splash-compact-panel-active": index() === props.selected() }}
              data-tone={example.id}
              role="tabpanel"
              id={`${id}-panel-${index()}`}
              aria-labelledby={`${id}-tab-${index()}`}
              aria-hidden={index() !== props.selected() ? "true" : undefined}
              tabIndex={index() === props.selected() ? 0 : -1}
            >
              <p class="am-splash-compact-pitch">{t(example.pitch)}</p>
              <Show when={index() === props.selected()}>
                <div class="am-splash-compact-preview" ref={(root) => frame(root, example)}>
                  <Framing.Provider value={true}>
                    <SidebarPreview selected={props.selected} />
                  </Framing.Provider>
                </div>
              </Show>
              <ul class="am-splash-compact-features">
                <For each={example.features}>
                  {(feature) => (
                    <li>
                      <span class="am-splash-tab-dot" aria-hidden="true" />
                      {t(feature.name)}
                    </li>
                  )}
                </For>
              </ul>
            </div>
          )}
        </For>
      </div>
    </div>
  )
}

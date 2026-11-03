import { For, Show, createEffect, createUniqueId, type Accessor, type JSX } from "solid-js"
import { Button } from "@kilocode/kilo-ui/button"
import { useLanguage } from "../../src/context/language"
import { examples } from "./examples"
import { SidebarPreview } from "./Preview"
import { wrap } from "./selection"

export function Compact(props: { selected: Accessor<number>; onSelect: (index: number) => void }) {
  const { t } = useLanguage()
  const id = createUniqueId()
  const tabs: HTMLButtonElement[] = []
  createEffect(() => tabs.at(props.selected())?.scrollIntoView({ block: "nearest", inline: "nearest" }))
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
                <SidebarPreview selected={props.selected} />
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

import { For, createEffect, createSignal, onMount, onCleanup, type Accessor } from "solid-js"
import { Tabs } from "@kilocode/kilo-ui/tabs"
import { useLanguage } from "../../src/context/language"
import { examples } from "./examples"

export function Compact(props: { selected: Accessor<number>; onSelect: (index: number) => void }) {
  const { t } = useLanguage()
  const tabs: HTMLButtonElement[] = []
  const [edges, setEdges] = createSignal({ left: false, right: false })
  let list!: HTMLDivElement
  const measure = () => {
    const box = list.getBoundingClientRect()
    const first = tabs.at(0)?.getBoundingClientRect()
    const last = tabs.at(-1)?.getBoundingClientRect()
    if (!first || !last) return
    setEdges({
      left: Math.min(first.left, last.left) < box.left - 1,
      right: Math.max(first.right, last.right) > box.right + 1,
    })
  }
  createEffect(() => {
    tabs.at(props.selected())?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" })
    if (list) measure()
  })
  onMount(() => {
    const guard = (event: KeyboardEvent) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return
      if (!event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) return
      event.preventDefault()
      event.stopPropagation()
    }
    // Stop modified navigation before the shared primitive handles the key.
    list.addEventListener("keydown", guard, true)
    const observer = new ResizeObserver(measure)
    observer.observe(list)
    for (const tab of tabs) observer.observe(tab)
    void document.fonts.ready.then(measure)
    onCleanup(() => {
      observer.disconnect()
      list.removeEventListener("keydown", guard, true)
    })
  })
  return (
    <Tabs
      class="am-splash-compact"
      variant="pill"
      value={String(props.selected())}
      onChange={(value) => props.onSelect(Number(value))}
    >
      <Tabs.List
        ref={list}
        class="am-splash-tabs"
        classList={{ "am-splash-tabs-left": edges().left, "am-splash-tabs-right": edges().right }}
        aria-label={t("agentManager.splash.eyebrow")}
        onScroll={measure}
      >
        <For each={examples}>
          {(example, index) => (
            <Tabs.Trigger
              ref={(node: HTMLButtonElement) => {
                tabs[index()] = node
              }}
              value={String(index())}
              classes={{ button: "am-splash-tab" }}
              data-tone={example.id}
            >
              <span class="am-splash-tab-dot" aria-hidden="true" />
              {t(example.tag)}
            </Tabs.Trigger>
          )}
        </For>
      </Tabs.List>
      <div class="am-splash-example">
        <For each={examples}>
          {(example, index) => (
            <Tabs.Content
              value={String(index())}
              forceMount
              class="am-splash-example-panel am-splash-compact-panel"
              classList={{
                "am-splash-example-panel-active": index() === props.selected(),
              }}
            >
              <p class="am-splash-pitch">{t(example.pitch)}</p>
            </Tabs.Content>
          )}
        </For>
      </div>
    </Tabs>
  )
}

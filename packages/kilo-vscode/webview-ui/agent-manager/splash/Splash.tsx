import { For, Show, createSignal, createUniqueId, onMount, onCleanup, type Accessor, type JSX } from "solid-js"
import { Button } from "@kilocode/kilo-ui/button"
import { Icon } from "@kilocode/kilo-ui/icon"
import { IconButton } from "@kilocode/kilo-ui/icon-button"
import { WelcomeEmptyState, KiloLogo } from "../../src/components/chat/WelcomeEmptyState"
import { useLanguage } from "../../src/context/language"
import type { SessionInfo } from "../../src/types/messages"
import { examples } from "./examples"
import { SidebarPreview } from "./Preview"
import { Compact } from "./Compact"
import { visible, wrap } from "./selection"
import "./splash.css"

interface EmptyProps {
  sessions?: () => SessionInfo[]
  onSelectSession?: (id: string) => void
  onShowHistory?: () => void
  hints?: () => JSX.Element
}

function ExamplePicker(props: { selected: Accessor<number>; onSelect: (index: number) => void }) {
  const { t } = useLanguage()
  const current = () => examples.at(props.selected()) ?? examples.at(0)!

  return (
    <>
      <div class="am-splash-picker">
        <div class="am-splash-carousel">
          <IconButton
            icon="chevron-left"
            variant="ghost"
            class="am-splash-arrow"
            label={t("agentManager.splash.carousel.previous")}
            onClick={() => props.onSelect(wrap(props.selected(), -1, examples.length))}
          />
          <div class="am-splash-cards">
            <For each={visible(props.selected(), examples.length, 3)}>
              {(index) => {
                const example = examples.at(index)!
                return (
                  <button
                    type="button"
                    class="am-splash-card"
                    classList={{ "am-splash-card-selected": index === props.selected() }}
                    data-tone={example.id}
                    aria-current={index === props.selected() ? "true" : undefined}
                    onClick={() => props.onSelect(index)}
                  >
                    <span class="am-splash-card-tag">{t(example.tag)}</span>
                    <span class="am-splash-card-title">{t(example.title)}</span>
                  </button>
                )
              }}
            </For>
          </div>
          <IconButton
            icon="chevron-right"
            variant="ghost"
            class="am-splash-arrow"
            label={t("agentManager.splash.carousel.next")}
            onClick={() => props.onSelect(wrap(props.selected(), 1, examples.length))}
          />
        </div>
        <div class="am-splash-dots">
          <For each={examples}>
            {(example, index) => (
              <button
                type="button"
                class="am-splash-dot"
                classList={{ "am-splash-dot-selected": index() === props.selected() }}
                aria-current={index() === props.selected() ? "true" : undefined}
                aria-label={t("agentManager.splash.carousel.goTo", { title: t(example.title) })}
                onClick={() => props.onSelect(index())}
              >
                <span class="am-splash-dot-mark" />
              </button>
            )}
          </For>
        </div>
      </div>
      <div class="am-splash-example">
        <For each={examples}>
          {(example, index) => (
            <div
              class="am-splash-example-panel"
              classList={{ "am-splash-example-panel-active": index() === props.selected() }}
              data-tone={example.id}
              aria-hidden={index() === props.selected() ? undefined : "true"}
            >
              <p class="am-splash-pitch">{t(example.pitch)}</p>
              <ul class="am-splash-features">
                <For each={example.features}>
                  {(feature) => (
                    <li class="am-splash-feature">
                      <span class="am-splash-feature-dot" aria-hidden="true" />
                      <span>
                        <strong>{t(feature.name)}</strong>
                        <span aria-hidden="true"> · </span>
                        {t(feature.text)}
                      </span>
                    </li>
                  )}
                </For>
              </ul>
            </div>
          )}
        </For>
      </div>
      <div class="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {t(current().title)} — {t(current().pitch)}
      </div>
    </>
  )
}

export function SplashExpanded(props: { onHide: () => void; onStart: () => void; initialExample?: number }) {
  const { t } = useLanguage()
  const titleId = createUniqueId()
  const [selected, setSelected] = createSignal(Math.max(0, Math.min(props.initialExample ?? 0, examples.length - 1)))
  const [wide, setWide] = createSignal(false)
  let root!: HTMLElement
  onMount(() => {
    const pane = root.closest('.am-intro-layout > [data-slot="message-list"]')
    if (!pane) return
    const observer = new ResizeObserver(([entry]) => setWide((entry?.contentRect.width ?? 0) >= 880))
    observer.observe(pane)
    onCleanup(() => observer.disconnect())
  })
  return (
    <section ref={root} class="am-splash" classList={{ "am-splash-wide": wide() }} aria-labelledby={titleId}>
      <div class="am-splash-frame">
        <article class="am-splash-hero">
          <div class="am-splash-hero-main">
            <header class="am-splash-header">
              <div class="am-splash-logo" aria-hidden="true">
                <KiloLogo />
              </div>
              <span class="am-splash-eyebrow">{t("agentManager.splash.eyebrow")}</span>
              <Button
                variant="ghost"
                size="small"
                class="am-splash-hide"
                aria-label={t("agentManager.splash.hideLabel")}
                onClick={props.onHide}
              >
                {t("agentManager.splash.hide")}
              </Button>
            </header>
            <h2 class="am-splash-title" id={titleId}>
              {t("agentManager.splash.title")}
            </h2>
            <p class="am-splash-subtitle">
              {t(wide() ? "agentManager.splash.subtitle" : "agentManager.splash.compact.subtitle")}
            </p>
            <Show when={wide()} fallback={<Compact selected={selected} onSelect={setSelected} />}>
              <ExamplePicker selected={selected} onSelect={setSelected} />
            </Show>
            <div class="am-splash-actions">
              <Button variant="primary" onClick={props.onStart}>
                {t("agentManager.splash.start")}
              </Button>
              <span class="am-splash-hint">
                {t(wide() ? "agentManager.splash.hint" : "agentManager.splash.compact.hint")}
              </span>
            </div>
          </div>
          <Show when={wide()}>
            <div class="am-splash-hero-side">
              <SidebarPreview selected={selected} />
            </div>
          </Show>
        </article>
      </div>
    </section>
  )
}

export function SplashFolded(props: EmptyProps & { onShowExamples: () => void }) {
  const { t } = useLanguage()
  return (
    <div class="am-splash-folded-layout">
      <div class="am-splash-folded" role="region" aria-label={t("agentManager.splash.folded.title")}>
        <div class="am-splash-folded-logo" aria-hidden="true">
          <KiloLogo />
        </div>
        <div class="am-splash-folded-text">
          <span class="am-splash-folded-title">{t("agentManager.splash.folded.title")}</span>
          <span class="am-splash-folded-note">{t("agentManager.splash.folded.note")}</span>
        </div>
        <Button variant="ghost" size="small" class="am-splash-show" onClick={props.onShowExamples}>
          {t("agentManager.splash.showExamples")}
          <Icon name="chevron-right" size="small" />
        </Button>
      </div>
      <div class="am-splash-folded-body">
        <WelcomeEmptyState
          sessions={props.sessions}
          onSelectSession={props.onSelectSession}
          onShowHistory={props.onShowHistory}
          footer={props.hints?.()}
        />
      </div>
    </div>
  )
}

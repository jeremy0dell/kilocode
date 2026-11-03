import { For, createEffect, createSignal, createUniqueId, onCleanup, onMount, type Accessor, type JSX } from "solid-js"
import { Button } from "@kilocode/kilo-ui/button"
import { Icon } from "@kilocode/kilo-ui/icon"
import { IconButton } from "@kilocode/kilo-ui/icon-button"
import { WelcomeEmptyState, KiloLogo } from "../../src/components/chat/WelcomeEmptyState"
import { useLanguage } from "../../src/context/language"
import type { SessionInfo } from "../../src/types/messages"
import { examples } from "./examples"
import { SidebarPreview } from "./Preview"
import { start, wrap } from "./selection"
import "./splash.css"

interface EmptyProps {
  sessions?: () => SessionInfo[]
  onSelectSession?: (id: string) => void
  onShowHistory?: () => void
  hints?: () => JSX.Element
}

function ExamplePicker(props: {
  selected: Accessor<number>
  onSelect: (index: number) => void
  highlight: Accessor<number | undefined>
  onHighlight: (index: number | undefined) => void
  features: string
}) {
  const { t } = useLanguage()
  const current = () => examples.at(props.selected()) ?? examples.at(0)!
  let track!: HTMLDivElement
  const scroll = () => {
    const first = track.firstElementChild as HTMLElement | null
    const card = track.children.item(start(props.selected(), examples.length)) as HTMLElement | null
    if (!first || !card) return
    track.scrollTo({ left: card.offsetLeft - first.offsetLeft })
  }
  createEffect(scroll)
  onMount(() => {
    const observer = new ResizeObserver(scroll)
    observer.observe(track)
    onCleanup(() => observer.disconnect())
  })

  const navigate = (event: KeyboardEvent, index: number) => {
    const rtl = getComputedStyle(track).direction === "rtl"
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? examples.length - 1
          : event.key === "ArrowLeft"
            ? wrap(index, rtl ? 1 : -1, examples.length)
            : event.key === "ArrowRight"
              ? wrap(index, rtl ? -1 : 1, examples.length)
              : undefined
    if (next == null) return
    event.preventDefault()
    props.onSelect(next)
    ;(track.children.item(next) as HTMLElement | null)?.focus({ preventScroll: true })
  }

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
          <div class="am-splash-cards" ref={track}>
            <For each={examples}>
              {(example, index) => {
                return (
                  <Button
                    variant="ghost"
                    class="am-splash-card"
                    classList={{ "am-splash-card-selected": index() === props.selected() }}
                    data-tone={example.id}
                    aria-current={index() === props.selected() ? "true" : undefined}
                    tabIndex={index() === props.selected() ? 0 : -1}
                    onClick={() => props.onSelect(index())}
                    onKeyDown={(event: KeyboardEvent) => navigate(event, index())}
                  >
                    <span class="am-splash-card-tag">{t(example.tag)}</span>
                    <span class="am-splash-card-title">{t(example.title)}</span>
                  </Button>
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
              <Button
                variant="ghost"
                class="am-splash-dot"
                classList={{ "am-splash-dot-selected": index() === props.selected() }}
                aria-current={index() === props.selected() ? "true" : undefined}
                aria-label={t("agentManager.splash.carousel.goTo", { title: t(example.title) })}
                onClick={() => props.onSelect(index())}
              >
                <span class="am-splash-dot-mark" />
              </Button>
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
                  {(feature, position) => (
                    <li
                      id={`${props.features}-${example.id}-${position()}`}
                      class="am-splash-feature"
                      classList={{ "am-splash-feature-highlight": props.highlight() === position() }}
                      onMouseEnter={() => props.onHighlight(position())}
                      onMouseLeave={() => props.onHighlight(undefined)}
                    >
                      <span class="am-splash-feature-marker" aria-hidden="true">
                        {position() + 1}
                      </span>
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

export function SplashExpanded(props: {
  onHide: () => void
  onStart: () => void
  onCreateWorktree: () => void
  initialExample?: number
}) {
  const { t } = useLanguage()
  const titleId = createUniqueId()
  const features = createUniqueId()
  const [highlight, setHighlight] = createSignal<number>()
  const [selected, setSelected] = createSignal(Math.max(0, Math.min(props.initialExample ?? 0, examples.length - 1)))
  return (
    <section class="am-splash" aria-labelledby={titleId}>
      <div class="am-splash-frame">
        <article class="am-splash-hero">
          <div class="am-splash-hero-main">
            <header class="am-splash-header">
              <div class="am-splash-logo" aria-hidden="true">
                <KiloLogo />
              </div>
              <span class="am-splash-eyebrow">{t("agentManager.splash.eyebrow")}</span>
              <Button variant="ghost" size="small" class="am-splash-hide" onClick={props.onHide}>
                {t("agentManager.splash.hide")}
              </Button>
            </header>
            <h2 class="am-splash-title" id={titleId}>
              {t("agentManager.splash.title")}
            </h2>
            <p class="am-splash-subtitle">{t("agentManager.splash.subtitle")}</p>
            <ExamplePicker
              selected={selected}
              onSelect={setSelected}
              highlight={highlight}
              onHighlight={setHighlight}
              features={features}
            />
            <div class="am-splash-actions">
              <Button variant="primary" onClick={props.onCreateWorktree}>
                {t("agentManager.dialog.createWorktree")}
              </Button>
              <span class="am-splash-hint">
                {t("agentManager.splash.hint")}{" "}
                <button type="button" class="am-splash-proceed" onClick={props.onStart}>
                  {t("agentManager.splash.proceed")}
                </button>
              </span>
            </div>
          </div>
          <div class="am-splash-hero-side">
            <SidebarPreview selected={selected} highlight={highlight} onHighlight={setHighlight} features={features} />
          </div>
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
        <span class="am-splash-folded-title">{t("agentManager.splash.folded.title")}</span>
        <span class="am-splash-folded-note" title={t("agentManager.splash.folded.note")}>
          {t("agentManager.splash.folded.note")}
        </span>
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

import { For, createEffect, createSignal, createUniqueId, onCleanup, onMount, type JSX } from "solid-js"
import { Button } from "@kilocode/kilo-ui/button"
import { Icon } from "@kilocode/kilo-ui/icon"
import { IconButton } from "@kilocode/kilo-ui/icon-button"
import { WelcomeEmptyState, KiloLogo } from "../../src/components/chat/WelcomeEmptyState"
import { useLanguage } from "../../src/context/language"
import type { SessionInfo } from "../../src/types/messages"
import { examples } from "./examples"
import { start, wrap } from "./selection"
import "./splash.css"

interface EmptyProps {
  sessions?: () => SessionInfo[]
  onSelectSession?: (id: string) => void
  onShowHistory?: () => void
  hints?: () => JSX.Element
}

function ExamplePicker(props: { initial?: number }) {
  const { t } = useLanguage()
  const [selected, setSelected] = createSignal(Math.max(0, Math.min(props.initial ?? 0, examples.length - 1)))
  const current = () => examples.at(selected()) ?? examples.at(0)!
  let track!: HTMLDivElement
  const scroll = () => {
    const first = track.firstElementChild as HTMLElement | null
    const card = track.children.item(start(selected(), examples.length)) as HTMLElement | null
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
    setSelected(next)
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
            onClick={() => setSelected(wrap(selected(), -1, examples.length))}
          />
          <div class="am-splash-cards" ref={track}>
            <For each={examples}>
              {(example, index) => {
                return (
                  <Button
                    variant="ghost"
                    class="am-splash-card"
                    classList={{ "am-splash-card-selected": index() === selected() }}
                    data-tone={example.id}
                    aria-current={index() === selected() ? "true" : undefined}
                    tabIndex={index() === selected() ? 0 : -1}
                    onClick={() => setSelected(index())}
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
            onClick={() => setSelected(wrap(selected(), 1, examples.length))}
          />
        </div>
        <div class="am-splash-dots">
          <For each={examples}>
            {(example, index) => (
              <Button
                variant="ghost"
                class="am-splash-dot"
                classList={{ "am-splash-dot-selected": index() === selected() }}
                aria-current={index() === selected() ? "true" : undefined}
                aria-label={t("agentManager.splash.carousel.goTo", { title: t(example.title) })}
                onClick={() => setSelected(index())}
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
              classList={{ "am-splash-example-panel-active": index() === selected() }}
              data-tone={example.id}
              aria-hidden={index() === selected() ? undefined : "true"}
            >
              <p class="am-splash-pitch">{t(example.pitch)}</p>
              <ul class="am-splash-features">
                <For each={example.features}>
                  {(feature, number) => (
                    <li class="am-splash-feature">
                      <span class="am-splash-feature-marker" aria-hidden="true">
                        {number() + 1}
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

export function SplashExpanded(props: { onHide: () => void; onStart: () => void; initialExample?: number }) {
  const { t } = useLanguage()
  const titleId = createUniqueId()
  return (
    <section class="am-splash" aria-labelledby={titleId}>
      <div class="am-splash-frame">
        <article class="am-splash-hero">
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
          <ExamplePicker initial={props.initialExample} />
          <div class="am-splash-actions">
            <Button variant="primary" onClick={props.onStart}>
              {t("agentManager.splash.start")}
            </Button>
            <span class="am-splash-hint">{t("agentManager.splash.hint")}</span>
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

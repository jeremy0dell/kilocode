import { createUniqueId, type JSX } from "solid-js"
import { Button } from "@kilocode/kilo-ui/button"
import { Icon } from "@kilocode/kilo-ui/icon"
import { WelcomeEmptyState, KiloLogo } from "../../src/components/chat/WelcomeEmptyState"
import { useLanguage } from "../../src/context/language"
import type { SessionInfo } from "../../src/types/messages"
import "./splash.css"

interface EmptyProps {
  sessions?: () => SessionInfo[]
  onSelectSession?: (id: string) => void
  onShowHistory?: () => void
  hints?: () => JSX.Element
}

export function SplashExpanded(props: { onHide: () => void; onStart: () => void }) {
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

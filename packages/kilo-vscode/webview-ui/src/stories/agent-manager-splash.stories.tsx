/// <reference types="vite/client" />
import type { Meta, StoryObj } from "storybook-solidjs-vite"
import { StoryProviders } from "./StoryProviders"
import { LanguageContext, useLanguage, type Locale } from "../context/language"
import { resolveTemplate } from "../context/language-utils"
import { SplashExpanded } from "../../agent-manager/splash/Splash"
import "../../agent-manager/agent-manager.css"
import "../../agent-manager/intro/intro.css"

const locales = import.meta.glob<{ dict: Record<string, string> }>("../../agent-manager/i18n/*.ts", { eager: true })

function Preview(props: { locale: Locale }) {
  const language = useLanguage()
  const dict = () => locales[`../../agent-manager/i18n/${props.locale}.ts`]?.dict ?? {}
  return (
    <LanguageContext.Provider
      value={{
        ...language,
        locale: () => props.locale,
        t: (key, params) => resolveTemplate(dict()[key] ?? language.t(key, params), params),
      }}
    >
      <div class="am-intro-layout" dir={props.locale === "ar" || props.locale === "fa" ? "rtl" : "ltr"}>
        <div data-slot="message-list">
          <SplashExpanded onHide={() => {}} onStart={() => {}} />
        </div>
      </div>
    </LanguageContext.Provider>
  )
}

const meta = {
  title: "AgentManager/Splash polish",
  parameters: { layout: "fullscreen" },
  args: { locale: "en" as Locale },
  argTypes: {
    locale: { control: "select", options: Object.keys(locales).map((path) => path.split("/").at(-1)!.slice(0, -3)) },
  },
  render: (args) => (
    <StoryProviders>
      <Preview locale={args.locale} />
    </StoryProviders>
  ),
} satisfies Meta<{ locale: Locale }>

export default meta
type Story = StoryObj<typeof meta>

export const English: Story = {}
export const French: Story = { args: { locale: "fr" } }
export const Arabic: Story = { args: { locale: "ar" } }
export const Persian: Story = { args: { locale: "fa" } }

import { expect, type Page } from "@playwright/test"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const language: typeof import("../webview-ui/src/context/language-utils") = require("../webview-ui/src/context/language-utils")

export async function ready(page: Page, locale: string) {
  const normalized = language.normalizeLocale(locale)
  await expect(page.locator("html")).toHaveAttribute("lang", language.localeToBcp47(normalized))
  await expect(page.locator("html")).toHaveAttribute("dir", language.RTL_LOCALES.has(normalized) ? "rtl" : "ltr")
  await page.evaluate(() => document.fonts.ready)
}

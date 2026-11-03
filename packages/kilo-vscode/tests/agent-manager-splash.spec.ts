import AxeBuilder from "@axe-core/playwright"
import { expect, test, type Page } from "@playwright/test"
import { createRequire } from "node:module"
import { ready } from "./story-locale"

const require = createRequire(import.meta.url)
const french: typeof import("../webview-ui/src/context/language-dictionaries/fr") = require("../webview-ui/src/context/language-dictionaries/fr")
const arabic: typeof import("../webview-ui/src/context/language-dictionaries/ar") = require("../webview-ui/src/context/language-dictionaries/ar")

async function open(page: Page, theme = "dark-modern", locale = "en") {
  await page.goto(
    `/iframe.html?id=agentmanager--splash-french-story&viewMode=story&globals=theme:kilo-vscode;vscodeTheme:${theme}&args=locale:${locale}`,
  )
  await expect(page.locator(".am-splash-hero")).toBeVisible()
  await ready(page, locale)
}

for (const theme of ["dark-modern", "light-modern", "hc-black", "hc-light"]) {
  test(`${theme} CTA focus ring has a visible gap from its fill`, async ({ page }) => {
    await open(page, theme)
    await page.keyboard.press("Tab")
    const button = page.locator('.am-splash-actions [data-component="button"]')
    await button.focus()
    const outline = await button.evaluate((node) => ({
      visible: node.matches(":focus-visible"),
      style: getComputedStyle(node).outlineStyle,
      offset: Number.parseFloat(getComputedStyle(node).outlineOffset),
    }))
    expect(outline.visible).toBe(true)
    expect(outline.style).toBe("solid")
    expect(outline.offset).toBeGreaterThanOrEqual(2)
  })

  test(`${theme} hero and preview pass axe, including nested-interactive and aria-hidden-focus`, async ({ page }) => {
    await open(page, theme)
    for (const dot of await page.locator(".am-splash-dot").all()) {
      await dot.click()
      const result = await new AxeBuilder({ page })
        .include(".am-splash-hero")
        .include(".am-splash-preview-card")
        .analyze()
      expect([...result.passes, ...result.inapplicable].map((rule) => rule.id)).toEqual(
        expect.arrayContaining(["nested-interactive", "aria-hidden-focus"]),
      )
      const violations = await page.evaluate(
        (violations) =>
          violations.filter((rule) => {
            if (rule.id !== "color-contrast") return true
            // Only the reused real sidebar's colors are out of scope, inside its aria-hidden stack.
            return !rule.nodes.every((node) =>
              node.target.every(
                (selector) =>
                  typeof selector === "string" &&
                  document
                    .querySelector(selector)
                    ?.closest('.am-splash-preview-card .am-splash-preview-stack[aria-hidden="true"]') != null,
              ),
            )
          }),
        result.violations,
      )
      expect(violations).toEqual([])
    }
  })

  for (const width of [420, 520, 760, 1100]) {
    test(`${theme} at ${width}px keeps all five hero heights stable and tags readable`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1400 })
      await open(page, theme)
      const heights: number[] = []
      const ratios: number[] = []
      for (const dot of await page.locator(".am-splash-dot").all()) {
        await dot.click()
        heights.push(await page.locator(".am-splash-hero").evaluate((node) => node.getBoundingClientRect().height))
        ratios.push(
          await page.locator(".am-splash-card-selected").evaluate((node) => {
            const canvas = document.createElement("canvas")
            const context = canvas.getContext("2d")!
            const luminance = (color: string) => {
              context.clearRect(0, 0, 1, 1)
              context.fillStyle = color
              context.fillRect(0, 0, 1, 1)
              const rgb = [...context.getImageData(0, 0, 1, 1).data].slice(0, 3).map((value) => {
                const channel = value / 255
                return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
              })
              return rgb[0]! * 0.2126 + rgb[1]! * 0.7152 + rgb[2]! * 0.0722
            }
            const ink = luminance(getComputedStyle(node.querySelector(".am-splash-card-tag")!).color)
            const surface = luminance(getComputedStyle(node).backgroundColor)
            return (Math.max(ink, surface) + 0.05) / (Math.min(ink, surface) + 0.05)
          }),
        )
      }
      console.log(JSON.stringify({ theme, width, heights, ratios }))
      expect(Math.max(...heights) - Math.min(...heights)).toBe(0)
      expect(Math.min(...ratios)).toBeGreaterThanOrEqual(4.5)
      expect(await page.locator(".am-splash").evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true)
    })
  }
}

test("preview rows retain native hover without accepting focus", async ({ page }) => {
  await open(page)
  await expect(page.locator(".am-splash-preview-card")).toHaveAttribute("role", "figure")
  for (const dot of await page.locator(".am-splash-dot").all()) {
    await dot.click()
    for (const selector of [".am-local-item", ".am-worktree-item:not(.am-worktree-item-active)"]) {
      const row = page.locator(`.am-splash-preview-panel-active ${selector}`).first()
      await page.mouse.move(0, 0)
      const background = await row.evaluate((node) => getComputedStyle(node).backgroundColor)
      await row.hover()
      await expect.poll(() => row.evaluate((node) => getComputedStyle(node).backgroundColor)).not.toBe(background)
      await row.click()
      expect(await page.evaluate(() => document.activeElement?.closest(".am-splash-preview-card") != null)).toBe(false)
    }
  }
})

test("carousel announces selections and excludes the preview from forward and reverse focus traversal", async ({
  page,
}) => {
  await open(page)
  const status = page.getByRole("status")
  await expect(status).toHaveCount(1)
  await expect(status).toHaveAttribute("aria-live", "polite")
  const names: string[] = []
  for (const dot of await page.locator(".am-splash-dot").all()) {
    await dot.click()
    await expect(status).toContainText(await page.locator(".am-splash-card-selected .am-splash-card-title").innerText())
    names.push(await status.innerText())
  }
  expect(new Set(names).size).toBe(5)
  await page.keyboard.press("Tab")
  const count = await page.locator(".am-splash-hero-main button").count()
  for (const key of ["Tab", "Shift+Tab"]) {
    await page.getByRole("button", { name: "Hide Agent Manager introduction", exact: true }).focus()
    const order = []
    for (let index = 0; index < count + 2; index++) {
      order.push(
        await page.evaluate(() => {
          const node = document.activeElement!
          if (node.closest(".am-splash-preview-card")) throw new Error("Preview received focus")
          const style = getComputedStyle(node)
          if (node.closest(".am-splash") && (!node.matches(":focus-visible") || style.outlineStyle === "none")) {
            throw new Error("Missing focus ring")
          }
          return {
            label: node.getAttribute("aria-label") ?? node.textContent ?? "",
            splash: node.closest(".am-splash") !== null,
          }
        }),
      )
      await page.keyboard.press(key)
    }
    expect(order[0]?.label).toBe("Hide Agent Manager introduction")
    expect(order.at(-1)?.label).toBe("Hide Agent Manager introduction")
    expect(order.some((state) => !state.splash)).toBe(true)
    expect(order.filter((state) => state.label === "Start your first session")).toHaveLength(1)
  }
  const result = await new AxeBuilder({ page })
    .include(".am-splash-hero-main")
    .withTags(["wcag2a", "wcag2aa"])
    .analyze()
  expect(result.violations).toEqual([])
})

for (const locale of ["br", "da", "es", "fa", "fr", "it", "nl", "no", "pl", "ru", "uk"]) {
  test(`${locale} cards fit at 480px`, async ({ page }) => {
    await page.setViewportSize({ width: 480, height: 1600 })
    await open(page, "light-modern", locale)
    const heights: number[] = []
    for (const dot of await page.locator(".am-splash-dot").all()) {
      await dot.click()
      heights.push(await page.locator(".am-splash-hero").evaluate((node) => node.getBoundingClientRect().height))
      const clipped = await page
        .locator(".am-splash-card-selected")
        .evaluate((node) =>
          [...node.children]
            .filter((child) => child.scrollHeight > child.clientHeight + 1 || child.scrollWidth > child.clientWidth + 1)
            .map((child) => child.textContent),
        )
      expect(clipped).toEqual([])
    }
    expect(Math.max(...heights) - Math.min(...heights)).toBe(0)
  })
}

async function scales(page: Page, selector: string) {
  return page.locator(`${selector} [data-slot="icon-svg"]`).evaluateAll((icons) =>
    icons.map((icon) => {
      const button = icon.closest("button")
      let scale = 1
      for (let node: Element | null = icon; node; node = node.parentElement) {
        const transform = getComputedStyle(node).transform
        scale *= transform === "none" ? 1 : new DOMMatrixReadOnly(transform).a
        if (node === button) break
      }
      return scale
    }),
  )
}

for (const locale of ["en", "ar", "fa"]) {
  test(`${locale} selection inset and net chevron directions are correct in expanded and folded views`, async ({
    page,
  }) => {
    await open(page, "dark-modern", locale)
    const scale = locale === "en" ? 1 : -1
    const shadow = await page.locator(".am-splash-card-selected").evaluate((node) => getComputedStyle(node).boxShadow)
    expect(shadow).toContain(locale === "en" ? " 3px" : "-3px")
    await expect(page.locator('.am-splash-arrow [data-component="icon"][data-directional]')).toHaveCount(2)
    expect(await scales(page, ".am-splash-arrow")).toEqual([scale, scale])
    await page.goto(`/iframe.html?id=agentmanager--splash-folded-story&viewMode=story&args=locale:${locale}`)
    await expect(page.locator(".am-splash-show")).toBeVisible()
    await ready(page, locale)
    await expect(page.locator('.am-splash-show [data-component="icon"][data-directional]')).toHaveCount(1)
    expect(await scales(page, ".am-splash-show")).toEqual([scale])
  })
}

for (const [locale, dictionary] of [
  ["fr", french.default],
  ["ar", arabic.default],
] as const) {
  test(`${locale} folded story uses merged welcome and splash translations`, async ({ page }) => {
    await page.goto(`/iframe.html?id=agentmanager--splash-folded-story&viewMode=story&args=locale:${locale}`)
    await ready(page, locale)
    const dict = dictionary({})
    await expect(page.locator(".kilo-about-text")).toHaveText(dict["session.messages.welcome"]!)
    await expect(page.locator(".recent-sessions-label")).toHaveText(dict["session.recent"]!)
    await expect(page.locator(".show-history-btn")).toHaveText(dict["session.showHistory"]!)
    await expect(page.locator(".feedback-button")).toHaveText(dict["feedback.button"]!)
    await expect(page.locator(".am-splash-show")).toHaveText(dict["agentManager.splash.showExamples"]!)
  })
}

for (const locale of ["fr", "ar", "fa"]) {
  test(`${locale} capture waits for a delayed production dictionary`, async ({ page }) => {
    const requested = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    await page.route(
      new RegExp(`/(language-dictionaries/${locale}\\.ts|${locale}-[^/]+\\.js)(\\?|$)`),
      async (route) => {
        requested.resolve()
        await release.promise
        await route.continue()
      },
    )
    await page.goto(`/iframe.html?id=agentmanager--splash-french-story&viewMode=story&args=locale:${locale}`)
    await requested.promise
    await expect(page.locator(".am-splash-hero")).toBeVisible()
    await expect(page.locator("html")).toHaveAttribute("lang", "en")
    let captured = false
    const capture = ready(page, locale).then(() => {
      captured = true
      return page.screenshot()
    })
    await page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
    )
    expect(captured).toBe(false)
    release.resolve()
    await capture
    expect(captured).toBe(true)
  })
}

test("reduced motion disables only splash-owned control motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await open(page)
  const durations = await page
    .locator(".am-splash-hero-main button")
    .evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).transitionDuration))
  expect(durations.every((duration) => duration === "0s")).toBe(true)
})

test("every splash story root contains its card and expanded selections keep height stable", async ({ page }) => {
  for (const width of [420, 520, 760, 1100]) {
    await page.setViewportSize({ width, height: 1400 })
    for (const story of [
      "expanded",
      "orchestrator",
      "ops",
      "versions",
      "beyond-code",
      "narrow",
      "french",
      "arabic",
      "persian",
      "folded",
    ]) {
      await page.goto(`/iframe.html?id=agentmanager--splash-${story}-story&viewMode=story`)
      const card = page.locator(".am-splash-hero, .am-splash-folded")
      await expect(card).toBeVisible()
      await ready(page, { french: "fr", arabic: "ar", persian: "fa" }[story] ?? "en")
      const root = (await page.locator("#storybook-root").boundingBox())!
      const hero = (await card.boundingBox())!
      expect(root.height, `${story} at ${width}px root height`).toBeGreaterThanOrEqual(hero.height)
      expect(hero.x).toBeGreaterThanOrEqual(root.x)
      expect(hero.y).toBeGreaterThanOrEqual(root.y)
      expect(hero.x + hero.width).toBeLessThanOrEqual(root.x + root.width)
      expect(hero.y + hero.height).toBeLessThanOrEqual(root.y + root.height)
      if (story === "folded") continue
      const heights: number[] = []
      for (const dot of await page.locator(".am-splash-dot").all()) {
        await dot.click()
        heights.push(await page.locator(".am-splash-hero").evaluate((node) => node.getBoundingClientRect().height))
      }
      expect(Math.max(...heights) - Math.min(...heights), `${story} at ${width}px`).toBe(0)
    }
  }
})

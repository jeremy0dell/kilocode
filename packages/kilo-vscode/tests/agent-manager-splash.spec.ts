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

async function resize(page: Page, width: number) {
  await page.locator(".am-splash").evaluate((node, width) => {
    const root = node as HTMLElement
    root.style.width = `${width}px`
    root.style.maxWidth = "none"
    root.style.boxSizing = "content-box"
    root.style.flex = "none"
  }, width)
  await expect
    .poll(() =>
      page.locator(".am-splash").evaluate((node) => {
        const style = getComputedStyle(node)
        return node.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight)
      }),
    )
    .toBe(width)
  await expect(page.locator(".am-splash-tab")).toHaveCount(width < 880 ? 5 : 0)
  await expect(page.locator(".am-splash-dot")).toHaveCount(width < 880 ? 0 : 5)
}

async function intact(page: Page) {
  const issues = await page.locator(".am-splash-hero").evaluate((hero) => {
    const bounds = hero.getBoundingClientRect()
    const issues: string[] = []
    if (hero.scrollWidth > hero.clientWidth + 1) issues.push("hero horizontal overflow")
    for (const node of hero.querySelectorAll<HTMLElement>(
      ".am-splash-title,.am-splash-subtitle,.am-splash-pitch,.am-splash-feature strong,.am-splash-feature-description,.am-splash-actions [data-component=button],.am-splash-tab,.am-splash-hint,.am-splash-thin-hint",
    )) {
      const style = getComputedStyle(node)
      if (style.visibility === "hidden" || !node.checkVisibility()) continue
      const label = node.textContent?.trim() ?? node.className
      if (!["none", "", "0"].includes(style.webkitLineClamp)) issues.push(`clamped: ${label}`)
      if (node.scrollHeight > node.clientHeight + 1) issues.push(`vertical clipping: ${label}`)
      if (node.scrollWidth > node.clientWidth + 1) issues.push(`horizontal clipping: ${label}`)
      const box = node.getBoundingClientRect()
      if (!node.closest(".am-splash-tabs") && (box.left < bounds.left - 1 || box.right > bounds.right + 1)) {
        issues.push(`outside hero: ${label}`)
      }
    }
    return issues
  })
  expect(issues).toEqual([])
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

  for (const width of [420, 720, 1100]) {
    test(`${theme} at ${width}px hero and preview pass axe, including nested-interactive and aria-hidden-focus`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 1400 })
      await open(page, theme)
      await resize(page, width)
      const controls = page.locator(width < 880 ? ".am-splash-tab" : ".am-splash-dot")
      await expect(controls).toHaveCount(5)
      for (const control of await controls.all()) {
        await control.click()
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
          result.violations.map((rule) => ({
            id: rule.id,
            nodes: rule.nodes.map((node) => ({ target: node.target })),
          })),
        )
        expect(violations).toEqual([])
      }
    })
  }

  for (const width of [420, 520, 760, 1100]) {
    test(`${theme} at ${width}px keeps all five hero heights stable and tags readable`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1400 })
      await open(page, theme)
      await resize(page, width)
      const heights: number[] = []
      const ratios: number[] = []
      const controls = page.locator(width < 880 ? ".am-splash-tab" : ".am-splash-dot")
      await expect(controls).toHaveCount(5)
      for (const control of await controls.all()) {
        await control.click()
        heights.push(await page.locator(".am-splash-hero").evaluate((node) => node.getBoundingClientRect().height))
        if (width < 880) {
          await expect(page.locator(".am-splash-compact-panel.am-splash-example-panel-active")).toBeVisible()
          expect(
            await page.locator(".am-splash-preview-card").evaluate((node) => node.getBoundingClientRect().height),
          ).toBe(width < 560 ? 340 : 360)
          continue
        }
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
      expect(Math.max(...heights) - Math.min(...heights)).toBe(0)
      expect(heights).toHaveLength(5)
      if (width >= 880) expect(Math.min(...ratios)).toBeGreaterThanOrEqual(4.5)
      expect(await page.locator(".am-splash").evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true)
    })
  }
}

test("preview rows retain native hover without accepting focus", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 1400 })
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
      await row.click({ position: { x: 15, y: 15 } })
      expect(await page.evaluate(() => document.activeElement?.closest(".am-splash-preview-card") != null)).toBe(false)
    }
  }
})

test("carousel announces selections and only preview markers enter forward and reverse focus traversal", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 1400 })
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
  const count = await page
    .locator(".am-splash-hero button")
    .evaluateAll((nodes) => nodes.filter((node) => node.tabIndex >= 0).length)
  for (const key of ["Tab", "Shift+Tab"]) {
    await page.getByRole("button", { name: "Hide Agent Manager introduction", exact: true }).focus()
    const order = []
    for (let index = 0; index < count + 4; index++) {
      order.push(
        await page.evaluate(() => {
          const node = document.activeElement!
          if (node.closest(".am-splash-preview-card") && !node.matches(".am-splash-marker")) {
            throw new Error("Real preview row received focus")
          }
          const style = getComputedStyle(node)
          if (node.closest(".am-splash") && (!node.matches(":focus-visible") || style.outlineStyle === "none")) {
            throw new Error("Missing focus ring")
          }
          return {
            label: node.closest(".am-splash") ? (node.getAttribute("aria-label") ?? node.textContent ?? "") : "",
            splash: node.closest(".am-splash") !== null,
          }
        }),
      )
      if (index > 0 && order.at(-1)?.label === "Hide Agent Manager introduction") break
      await page.keyboard.press(key)
    }
    expect(order[0]?.label).toBe("Hide Agent Manager introduction")
    expect(order.at(-1)?.label).toBe("Hide Agent Manager introduction")
    expect(order.some((state) => !state.splash)).toBe(true)
    expect(order.filter((state) => state.label === "Start your first session")).toHaveLength(1)
    expect(order.filter((state) => state.label.startsWith("Feature "))).toHaveLength(3)
  }
  const result = await new AxeBuilder({ page })
    .include(".am-splash-hero-main")
    .withTags(["wcag2a", "wcag2aa"])
    .analyze()
  expect(result.violations).toEqual([])
})

test("visible compact preview rows retain native hover inside the cropped preview", async ({ page }) => {
  await page.setViewportSize({ width: 520, height: 1400 })
  await open(page)
  for (const tab of await page.locator(".am-splash-tab").all()) {
    await tab.click()
    const row = page.locator(".am-splash-hero-side .am-splash-preview-panel-active .am-worktree-item").first()
    await page.mouse.move(0, 0)
    await expect
      .poll(() => row.locator(".am-wt-hover-actions").evaluate((node) => getComputedStyle(node).visibility))
      .toBe("hidden")
    await row.hover()
    await expect
      .poll(() => row.locator(".am-wt-hover-actions").evaluate((node) => getComputedStyle(node).visibility))
      .toBe("visible")
    await row.click()
    expect(await page.evaluate(() => document.activeElement?.closest(".am-splash-preview-card") != null)).toBe(false)
  }
})

for (const locale of ["en", "ar"]) {
  for (const width of [1280, 1010, 900, 880, 879, 800, 720, 600, 560, 559, 500, 440, 380, 340, 320, 300]) {
    test(`${locale} ${width}px content width preserves all five examples in the responsive mode`, async ({ page }) => {
      await page.setViewportSize({ width: 1500, height: 1600 })
      await open(page, "dark-modern", locale)
      await resize(page, width)
      const mode = width < 560 ? "thin" : width < 880 ? "narrow" : "wide"
      const preview = page.locator(".am-splash-hero-side .am-splash-preview-card")
      await expect(preview).toHaveCount(1)
      await expect(preview.locator(".am-splash-preview-panel")).toHaveCount(1)
      await expect(page.locator(".am-splash-example > .am-splash-example-panel")).toHaveCount(5)
      await expect(page.locator(".am-splash-feature-stack > .am-splash-features")).toHaveCount(5)
      expect(await page.locator(".am-splash").evaluate((node) => getComputedStyle(node).containerType)).toBe(
        "inline-size",
      )
      expect(await page.locator(".am-splash-hero").evaluate((node) => getComputedStyle(node).display)).toBe("grid")
      expect(
        await page
          .locator(".am-splash-hero")
          .evaluate((node) => getComputedStyle(node).getPropertyValue("--am-splash-mode").trim()),
      ).toBe(mode)
      const heights: number[] = []
      for (let index = 0; index < 5; index++) {
        await page
          .locator(mode === "wide" ? ".am-splash-dot" : ".am-splash-tab")
          .nth(index)
          .click()
        await expect(page.locator(".am-splash-example-panel-active")).toBeVisible()
        await expect(preview.locator(".am-splash-preview-panel")).toHaveCount(1)
        await expect(page.locator(".am-splash-features-active")).toHaveCount(1)
        await expect
          .poll(() => preview.evaluate((node) => node.getBoundingClientRect().height))
          .toBe(mode === "thin" ? 340 : mode === "narrow" ? 360 : 428)
        await intact(page)
        heights.push(await page.locator(".am-splash-hero").evaluate((node) => node.getBoundingClientRect().height))
        if (mode === "thin") {
          await expect(page.locator(".am-splash-feature-stack")).toBeHidden()
          await expect(page.locator(".am-splash-thin-hint")).toBeVisible()
          continue
        }
        await expect(page.locator(".am-splash-thin-hint")).toBeHidden()
        await expect(page.locator(".am-splash-features-active")).toBeVisible()
        if (mode === "wide") {
          await expect(page.locator(".am-splash-card")).toHaveCount(5)
          continue
        }
        const features = (await page.locator(".am-splash-feature-stack").boundingBox())!
        const side = (await preview.boundingBox())!
        expect(Math.min(features.y + features.height, side.y + side.height)).toBeGreaterThan(
          Math.max(features.y, side.y),
        )
        expect(features.x + features.width <= side.x + 1 || side.x + side.width <= features.x + 1).toBe(true)
        for (const feature of await page.locator(".am-splash-features-active .am-splash-feature-text").all()) {
          const title = (await feature.locator("strong").boundingBox())!
          const description = (await feature.locator(".am-splash-feature-description").boundingBox())!
          expect(description.y).toBeGreaterThanOrEqual(title.y + title.height - 1)
        }
      }
      expect(Math.max(...heights) - Math.min(...heights)).toBe(0)
      const panel = page.locator(".am-splash-preview-panel-active")
      await page
        .locator(mode === "wide" ? ".am-splash-dot" : ".am-splash-tab")
        .first()
        .click()
      expect(await panel.locator(".am-project-item").allTextContents()).toEqual([
        expect.stringContaining("billing-api"),
        expect.stringContaining("web-app"),
        expect.stringContaining("infra"),
      ])
      await page
        .locator(mode === "wide" ? ".am-splash-dot" : ".am-splash-tab")
        .nth(2)
        .click()
      await expect(
        panel.locator(".am-section-group-header").filter({ hasText: "IMPLEMENT" }).locator(".am-sidebar-header-toggle"),
      ).toHaveAttribute("aria-expanded", "true")
      await expect(panel.locator(".am-worktree-item").filter({ hasText: "Rate-limit the login endpoint" })).toHaveCount(
        1,
      )
      expect(await preview.evaluate((node) => node.scrollTop)).toBe(0)
    })
  }
}

test("Show, Hide, and resize cycles emit no window errors", async ({ page }) => {
  await page.addInitScript(() => {
    const errors: string[] = []
    window.addEventListener("error", (event) => errors.push(event.message))
    Object.defineProperty(window, "splashErrors", { value: errors })
  })
  await page.setViewportSize({ width: 1100, height: 1400 })
  await page.goto("/iframe.html?id=agentmanager--splash-folded-story&viewMode=story&args=locale:ar")
  for (let cycle = 0; cycle < 3; cycle++) {
    await page.locator(".am-splash-show").click()
    await expect(page.locator('.am-splash[data-wide="true"]')).toBeVisible()
    await page.setViewportSize({ width: 520, height: 1400 })
    await expect(page.getByRole("tab")).toHaveCount(5)
    await page.setViewportSize({ width: 1100, height: 1400 })
    await expect(page.locator('.am-splash[data-wide="true"]')).toBeVisible()
    await page.locator(".am-splash-hide").click()
    await expect(page.locator(".am-splash-show")).toBeVisible()
  }
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  expect(await page.evaluate(() => Reflect.get(window, "splashErrors") as string[])).toEqual([])
})

for (const locale of ["br", "da", "es", "fa", "fr", "it", "nl", "no", "pl", "ru", "uk"]) {
  test(`${locale} cards fit at 480px`, async ({ page }) => {
    await page.setViewportSize({ width: 480, height: 1600 })
    await open(page, "light-modern", locale)
    const heights: number[] = []
    const tabs = page.locator(".am-splash-tab")
    await expect(tabs).toHaveCount(5)
    for (const tab of await tabs.all()) {
      await tab.click()
      heights.push(await page.locator(".am-splash-hero").evaluate((node) => node.getBoundingClientRect().height))
      await intact(page)
    }
    expect(heights).toHaveLength(5)
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
    await page.setViewportSize({ width: 1100, height: 1400 })
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
    await page.locator(".am-splash-show").click()
    await expect(page.locator('.am-splash[data-wide="true"]')).toBeVisible()
    expect(await scales(page, ".am-splash-arrow")).toEqual([scale, scale])
    await page.locator(".am-splash-hide").click()
    await expect(page.locator(".am-splash-show")).toBeVisible()
    expect(await scales(page, ".am-splash-show")).toEqual([scale])
    await page.locator(".am-splash-show").click()
    await expect(page.locator('.am-splash[data-wide="true"]')).toBeVisible()
    expect(await scales(page, ".am-splash-arrow")).toEqual([scale, scale])
    await page.setViewportSize({ width: 760, height: 1400 })
    await expect(page.getByRole("tab")).toHaveCount(5)
    // Compact tabs have no chevrons or splash-owned directional icons to mirror.
    await expect(page.locator('.am-splash-tab [data-slot="icon-svg"]')).toHaveCount(0)
    await page.setViewportSize({ width: 1100, height: 1400 })
    await expect(page.locator('.am-splash[data-wide="true"]')).toBeVisible()
    expect(await scales(page, ".am-splash-arrow")).toEqual([scale, scale])
  })
}

for (const width of [340, 720, 1100]) {
  test(`${width}px reduced motion disables only splash-owned control motion`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" })
    await page.setViewportSize({ width: 1500, height: 1600 })
    await open(page)
    await resize(page, width)
    const durations = await page
      .locator(".am-splash-hero-main button, .am-splash-marker")
      .evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).transitionDuration))
    expect(durations.length).toBeGreaterThan(0)
    expect(durations.every((duration) => duration === "0s")).toBe(true)
    await page
      .locator(width < 880 ? ".am-splash-tab" : ".am-splash-dot")
      .last()
      .click()
    await intact(page)
  })
}

for (const locale of ["en", "ar", "fa", "fr"]) {
  test(`${locale} compact tabs support roving focus, linked panels, and visible keyboard selections`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 420, height: 1400 })
    await open(page, "dark-modern", locale)
    const tabs = page.locator(".am-splash-tab")
    const panels = page.locator(".am-splash-compact-panel")
    await expect(tabs).toHaveCount(5)
    await expect(panels).toHaveCount(5)
    await expect(page.getByRole("tablist")).toHaveCount(1)
    await expect(page.locator(".am-splash-dot")).toHaveCount(0)
    if (locale === "fr") {
      expect(await page.getByRole("tablist").evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true)
    }
    const rtl = locale === "ar" || locale === "fa"
    await tabs.first().focus()
    for (const modifier of ["Alt", "Control", "Meta", "Shift"]) {
      await page.keyboard.press(`${modifier}+ArrowRight`)
      await expect(tabs.first()).toBeFocused()
      await expect(tabs.first()).toHaveAttribute("aria-selected", "true")
    }
    for (const [key, index] of [
      ["ArrowRight", rtl ? 4 : 1],
      ["ArrowLeft", 0],
      ["End", 4],
      ["ArrowRight", rtl ? 3 : 0],
      ["Home", 0],
      ["ArrowLeft", rtl ? 1 : 4],
    ] as const) {
      await page.keyboard.press(key)
      await expect(tabs.nth(index)).toBeFocused()
      await expect(page.getByRole("tab", { selected: true })).toHaveCount(1)
      await expect(page.getByRole("tabpanel")).toHaveCount(1)
      for (let position = 0; position < 5; position++) {
        const tab = tabs.nth(position)
        const panel = panels.nth(position)
        await expect(tab).toHaveAttribute("role", "tab")
        await expect(tab).toHaveAttribute("aria-selected", String(position === index))
        await expect(tab).toHaveAttribute("tabindex", position === index ? "0" : "-1")
        await expect(panel).toHaveAttribute("role", "tabpanel")
        await expect(panel).toHaveAttribute("aria-labelledby", (await tab.getAttribute("id"))!)
        if (position !== index) {
          await expect(panel).toBeHidden()
          continue
        }
        await expect(tab).toHaveAttribute("aria-controls", (await panel.getAttribute("id"))!)
        await expect(panel).toHaveClass(/am-splash-example-panel-active/)
        await expect(panel).toBeVisible()
        await expect(panel).toHaveAttribute("tabindex", "0")
        await expect(panel.locator(".am-splash-pitch")).toHaveCount(1)
        await expect(panel.locator(".am-splash-preview-card, .am-splash-features")).toHaveCount(0)
      }
      await expect(page.locator(".am-splash-hero-side .am-splash-preview-card")).toHaveAttribute("role", "figure")
      await expect
        .poll(() =>
          tabs.nth(index).evaluate((node) => {
            const tab = node.getBoundingClientRect()
            const list = node.closest('[role="tablist"]')!.getBoundingClientRect()
            return tab.left >= list.left - 1 && tab.right <= list.right + 1
          }),
        )
        .toBe(true)
    }
  })
}

for (const locale of ["en", "ar", "fa", "fr"]) {
  for (const motion of ["no-preference", "reduce"] as const) {
    test(`${locale} ${motion} tab fades track physical clipping during keyboard selection and resize`, async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: motion })
      await page.setViewportSize({ width: 1500, height: 1600 })
      await open(page, "dark-modern", locale)
      await resize(page, 300)
      const tabs = page.locator(".am-splash-tab")
      const list = page.getByRole("tablist")
      const rtl = locale === "ar" || locale === "fa"
      expect(await list.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true)
      await tabs.first().focus()
      for (const [key, index] of [
        ["Home", 0],
        ["End", 4],
        ["Home", 0],
      ] as const) {
        await page.keyboard.press(key)
        await expect(tabs.nth(index)).toBeFocused()
        await expect(tabs.nth(index)).toHaveAttribute("aria-selected", "true")
        const left = rtl ? index === 0 : index === 4
        await expect.poll(() => list.evaluate((node) => node.classList.contains("am-splash-tabs-left"))).toBe(left)
        await expect.poll(() => list.evaluate((node) => node.classList.contains("am-splash-tabs-right"))).toBe(!left)
        await expect
          .poll(() =>
            list.evaluate((node) => {
              const box = node.getBoundingClientRect()
              const tabs = [...node.querySelectorAll(".am-splash-tab")].map((tab) => tab.getBoundingClientRect())
              const left = tabs.some((tab) => tab.left < box.left - 1)
              const right = tabs.some((tab) => tab.right > box.right + 1)
              return (
                node.classList.contains("am-splash-tabs-left") === left &&
                node.classList.contains("am-splash-tabs-right") === right
              )
            }),
          )
          .toBe(true)
      }
      await resize(page, 879)
      await expect.poll(() => list.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
      await expect(list).not.toHaveClass(/am-splash-tabs-left|am-splash-tabs-right/)
      await resize(page, 300)
      await expect
        .poll(() =>
          list.evaluate(
            (node) => node.classList.contains("am-splash-tabs-left") || node.classList.contains("am-splash-tabs-right"),
          ),
        )
        .toBe(true)
    })
  }
}

test("compact forward and reverse focus traversal includes the panel but excludes every preview", async ({ page }) => {
  await page.setViewportSize({ width: 420, height: 1400 })
  await open(page)
  const hide = page.getByRole("button", { name: "Hide Agent Manager introduction", exact: true })
  const start = page.getByRole("button", { name: "Start your first session", exact: true })
  for (const tab of await page.locator(".am-splash-tab").all()) {
    await tab.click()
    const panel = page.locator(".am-splash-compact-panel.am-splash-example-panel-active")
    await hide.focus()
    for (const [key, target] of [
      ["Tab", tab],
      ["Tab", panel],
      ["Tab", start],
      ["Shift+Tab", panel],
      ["Shift+Tab", tab],
      ["Shift+Tab", hide],
    ] as const) {
      await page.keyboard.press(key)
      await expect(target).toBeFocused()
      expect(await target.evaluate((node) => node.closest(".am-splash-preview-card") != null)).toBe(false)
      expect(
        await target.evaluate(
          (node) => node.matches(":focus-visible") && getComputedStyle(node).outlineStyle !== "none",
        ),
      ).toBe(true)
    }
  }
})

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

test("mode follows the splash content box rather than viewport or padded parent width", async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 1600 })
  await open(page)
  await page.locator(".am-splash").evaluate((node) => {
    ;(node as HTMLElement).style.padding = "17px"
    node.parentElement!.style.padding = "23px"
  })
  for (const viewport of [1500, 500]) {
    await page.setViewportSize({ width: viewport, height: 1600 })
    for (const width of [559, 560, 879, 880]) {
      await resize(page, width)
      const stack = page.locator(".am-splash-feature-stack")
      if (width < 560) await expect(stack).toBeHidden()
      if (width >= 560) await expect(stack).toBeVisible()
      expect(
        await page.locator(".am-splash-preview-card").evaluate((node) => node.getBoundingClientRect().height),
      ).toBe(width < 560 ? 340 : width < 880 ? 360 : 428)
      await intact(page)
    }
  }
})

test("the 880px container breakpoint fits the wide carousel and preserves selection across remounts", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 1400 })
  await open(page)
  for (const width of [879, 880, 559, 560, 760, 1100]) {
    await resize(page, width)
    if (width < 880) {
      const tabs = page.locator(".am-splash-tab")
      await expect(tabs).toHaveCount(5)
      await expect(page.locator(".am-splash-dot")).toHaveCount(0)
      if (width === 879) await tabs.nth(3).click()
      await expect(tabs.nth(width === 879 ? 3 : 2)).toHaveAttribute("aria-selected", "true")
      continue
    }
    await expect(page.locator(".am-splash-tab")).toHaveCount(0)
    await expect(page.locator(".am-splash-dot")).toHaveCount(5)
    await expect(page.locator(".am-splash-dot").nth(width === 880 ? 3 : 2)).toHaveAttribute("aria-current", "true")
    await expect(page.locator(".am-splash-card-selected")).toHaveAttribute(
      "data-tone",
      width === 880 ? "versions" : "ops",
    )
    expect(await page.locator(".am-splash-hero").evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true)
    const bounds = (await page.locator(".am-splash").boundingBox())!
    for (const card of await page.locator(".am-splash-cards, .am-splash-preview-card").all()) {
      const box = (await card.boundingBox())!
      expect(box.x).toBeGreaterThanOrEqual(bounds.x)
      expect(box.x + box.width).toBeLessThanOrEqual(bounds.x + bounds.width)
    }
    if (width === 880) await page.locator(".am-splash-dot").nth(2).click()
  }
})

test("folded note is hidden below a 600px container, independently of the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 1400 })
  await page.goto("/iframe.html?id=agentmanager--splash-folded-story&viewMode=story")
  await expect(page.locator(".am-splash-folded")).toBeVisible()
  for (const width of [599, 600, 520, 760]) {
    await page.locator(".am-splash-folded-layout").evaluate((node, width) => {
      const layout = node as HTMLElement
      layout.style.width = `${width}px`
    }, width)
    const note = page.locator(".am-splash-folded-note")
    if (width < 600) {
      await expect(note).toBeHidden()
      continue
    }
    await expect(note).toBeVisible()
  }
})

for (const story of [
  "expanded",
  "cross-stack",
  "german",
  "orchestrator",
  "ops",
  "versions",
  "beyond-code",
  "narrow",
  "narrow-orchestrator",
  "narrow-ops",
  "narrow-versions",
  "narrow-beyond-code",
  "narrow-arabic",
  "narrow-french",
  "french",
  "arabic",
  "persian",
  "folded",
]) {
  for (const width of [420, 520, 760, 1100]) {
    test(`${story} at ${width}px root contains its card and selections keep height stable`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1600 })
      await page.goto(`/iframe.html?id=agentmanager--splash-${story}-story&viewMode=story`)
      const card = page.locator(".am-splash-hero, .am-splash-folded")
      await expect(card).toBeVisible()
      await ready(
        page,
        {
          french: "fr",
          arabic: "ar",
          persian: "fa",
          german: "de",
          "narrow-arabic": "ar",
          "narrow-french": "fr",
        }[story] ?? "en",
      )
      const root = (await page.locator("#storybook-root").boundingBox())!
      const hero = (await card.boundingBox())!
      expect(root.height, `${story} at ${width}px root height`).toBeGreaterThanOrEqual(hero.height)
      expect(hero.x).toBeGreaterThanOrEqual(root.x)
      expect(hero.y).toBeGreaterThanOrEqual(root.y)
      expect(hero.x + hero.width).toBeLessThanOrEqual(root.x + root.width)
      expect(hero.y + hero.height).toBeLessThanOrEqual(root.y + root.height)
      if (story === "folded") return
      const heights: number[] = []
      const controls = page.locator(".am-splash-tab, .am-splash-dot")
      await expect(controls).toHaveCount(5)
      for (const control of await controls.all()) {
        await control.click()
        heights.push(await page.locator(".am-splash-hero").evaluate((node) => node.getBoundingClientRect().height))
      }
      expect(heights).toHaveLength(5)
      expect(Math.max(...heights) - Math.min(...heights), `${story} at ${width}px`).toBe(0)
    })
  }
}

test.describe("standalone thin splash popover", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/iframe.html?id=agentmanager-splash-popover--thin&viewMode=story")
    await expect(page.getByRole("region", { name: "Multi-repo projects", exact: true })).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
  })

  test("announces the initial feature and associates only its selected marker", async ({ page }) => {
    const region = page.getByRole("region", { name: "Multi-repo projects", exact: true })
    await expect(region).toHaveAttribute("aria-live", "polite")
    await expect(region).toHaveAttribute("aria-atomic", "true")
    await expect(region).toContainText("Keep agents working across your repositories in one place.")
    const markers = page.getByRole("button", { name: /^Feature \d:/ })
    await expect(markers).toHaveCount(3)
    for (const [index, marker] of (await markers.all()).entries()) {
      await expect(marker).toHaveAttribute("aria-controls", "splash-popover-story")
      await expect(marker).toHaveAttribute("aria-expanded", index === 0 ? "true" : "false")
    }
    await expect(region).toHaveAttribute("id", "splash-popover-story")
  })

  test("same marker toggles, outside pointerdown dismisses, and Escape preserves marker focus", async ({ page }) => {
    const region = page.locator("#splash-popover-story")
    const marker = page.getByRole("button", { name: "Feature 1: Multi-repo projects", exact: true })
    await marker.click()
    await expect(region).toBeHidden()
    await expect(marker).toHaveAttribute("aria-expanded", "false")
    await marker.click()
    await expect(region).toBeVisible()
    await expect(marker).toHaveAttribute("aria-expanded", "true")
    await expect(marker).toBeFocused()
    await page.keyboard.press("Escape")
    await expect(region).toBeHidden()
    await expect(marker).toHaveAttribute("aria-expanded", "false")
    await expect(marker).toBeFocused()
    await marker.click()
    await expect(region).toBeVisible()
    const box = (await region.locator("..").boundingBox())!
    await page.mouse.move(box.x + 5, box.y + 5)
    await page.mouse.down()
    await expect(region).toBeHidden()
    await expect(marker).toHaveAttribute("aria-expanded", "false")
    await page.mouse.up()
  })

  test("previous and next wrap without stealing pointer focus from the marker", async ({ page }) => {
    const region = page.locator("#splash-popover-story")
    const markers = page.getByRole("button", { name: /^Feature \d:/ })
    const marker = markers.first()
    // The story starts open; close and reopen by pointer to establish marker focus.
    await marker.click()
    await marker.click()
    await expect(marker).toBeFocused()
    for (const [label, index, name] of [
      ["Previous feature", 2, "PR badges and diff counts"],
      ["Next feature", 0, "Multi-repo projects"],
      ["Next feature", 1, "Live session status"],
      ["Next feature", 2, "PR badges and diff counts"],
      ["Next feature", 0, "Multi-repo projects"],
    ] as const) {
      await region.getByRole("button", { name: label, exact: true }).click()
      await expect(region).toHaveAccessibleName(name)
      await expect(region.locator(".am-splash-popover__steps")).toContainText(`${index + 1}/3`)
      await expect(markers.nth(index)).toHaveAttribute("aria-expanded", "true")
      await expect(page.locator('button[aria-controls="splash-popover-story"][aria-expanded="true"]')).toHaveCount(1)
      await expect(marker).toBeFocused()
    }
  })

  for (const direction of ["ltr", "rtl"]) {
    test(`${direction} container resizes keep every popover inside the frame and clear of its anchored row`, async ({
      page,
    }) => {
      const region = page.locator("#splash-popover-story")
      const container = region.locator("..")
      const markers = page.getByRole("button", { name: /^Feature \d:/ })
      await container.evaluate((node, direction) => {
        const element = node as HTMLElement
        element.dir = direction
        element.style.width = "400px"
      }, direction)
      await expect
        .poll(() =>
          region.evaluate((node) => {
            const frame = node.parentElement!.firstElementChild!.getBoundingClientRect()
            const box = node.getBoundingClientRect()
            return (
              Math.abs(
                getComputedStyle(node).direction === "rtl"
                  ? box.right - (frame.right - 8)
                  : box.left - (frame.left + 8),
              ) <= 1
            )
          }),
        )
        .toBe(true)
      for (const width of [300, 240, 400]) {
        // Resize the observed container, not the browser viewport.
        await container.evaluate((node, width) => ((node as HTMLElement).style.width = `${width}px`), width)
        await expect.poll(() => container.evaluate((node) => node.getBoundingClientRect().width)).toBe(width)
        for (let index = 0; index < 3; index++) {
          const marker = markers.nth(index)
          if ((await marker.getAttribute("aria-expanded")) !== "true") await marker.click()
          await expect(region).toBeVisible()
          await expect(region).toHaveAccessibleName(
            (await marker.getAttribute("aria-label"))!.replace(/^Feature \d: /, ""),
          )
          await expect
            .poll(() =>
              marker.evaluate((node) => {
                const row = node.parentElement!
                const rows = row.parentElement!
                const frame = rows.parentElement!
                const pop = frame.parentElement!.querySelector<HTMLElement>("#splash-popover-story")!
                const bounds = frame.getBoundingClientRect()
                const anchor = row.getBoundingClientRect()
                const viewport = rows.getBoundingClientRect()
                const box = pop.getBoundingClientRect()
                const rtl = getComputedStyle(frame).direction === "rtl"
                return {
                  ready: pop.dataset.open === "true",
                  inside:
                    box.left >= bounds.left + 7 &&
                    box.right <= bounds.right - 7 &&
                    box.top >= bounds.top + 7 &&
                    box.bottom <= bounds.bottom - 7,
                  separated: box.bottom <= anchor.top - 3 || box.top >= anchor.bottom + 3,
                  aligned: Math.abs(rtl ? box.right - (bounds.right - 8) : box.left - (bounds.left + 8)) <= 1,
                  clearance: anchor.top >= viewport.top - 1 && anchor.bottom <= viewport.bottom - 27,
                }
              }),
            )
            .toEqual({ ready: true, inside: true, separated: true, aligned: true, clearance: true })
        }
      }
    })
  }

  test("reduced motion removes the popover transition and closed transform", async ({ page }) => {
    const region = page.locator("#splash-popover-story")
    await page.emulateMedia({ reducedMotion: "no-preference" })
    await expect(region).toHaveCSS("transition-duration", "0.12s, 0.12s")
    await page.emulateMedia({ reducedMotion: "reduce" })
    await expect(region).toHaveCSS("transition-duration", "0s")
    await expect(region).toHaveCSS("transform", "none")
    await page.getByRole("button", { name: "Feature 1: Multi-repo projects", exact: true }).click()
    await expect(region).toBeHidden()
    await expect(region).toHaveCSS("transition-duration", "0s")
    await expect(region).toHaveCSS("transform", "none")
  })
})

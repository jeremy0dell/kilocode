import AxeBuilder from "@axe-core/playwright"
import { expect, test, type Page } from "@playwright/test"

async function open(page: Page, theme = "dark-modern", locale = "en") {
  await page.goto(
    `/iframe.html?id=agentmanager-splash-polish--english&viewMode=story&globals=theme:kilo-vscode;vscodeTheme:${theme}&args=locale:${locale}`,
  )
  await expect(page.locator(".am-splash-hero")).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
}

for (const theme of ["dark-modern", "light-modern", "hc-black", "hc-light"]) {
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

test("carousel exposes each selection through one polite status and keeps focus outside the inert sidebar", async ({
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
  await page.getByRole("button", { name: "Hide Agent Manager introduction", exact: true }).focus()
  const order: string[] = []
  for (let index = 0; index < 12; index++) {
    order.push(
      await page.evaluate(() => {
        const node = document.activeElement!
        const style = getComputedStyle(node)
        if (node.closest(".am-splash")) {
          if (!node.matches(":focus-visible") || style.outlineStyle === "none") throw new Error("Missing focus ring")
          if (node.closest("[inert]")) throw new Error("Preview received focus")
        }
        return node.getAttribute("aria-label") ?? node.textContent ?? ""
      }),
    )
    await page.keyboard.press("Tab")
  }
  expect(order[0]).toBe("Hide Agent Manager introduction")
  expect(order.at(-1)).toBe("Start your first session")
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

for (const locale of ["ar", "fa"]) {
  test(`${locale} mirrors the selection bar and chevrons`, async ({ page }) => {
    await open(page, "dark-modern", locale)
    const shadow = await page.locator(".am-splash-card-selected").evaluate((node) => getComputedStyle(node).boxShadow)
    expect(shadow).toContain("-3px")
    const transform = await page
      .locator('.am-splash-arrow [data-component="icon"]')
      .first()
      .evaluate((node) => getComputedStyle(node).transform)
    expect(transform).toBe("matrix(-1, 0, 0, 1, 0, 0)")
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

test("existing splash story harnesses keep selection height stable", async ({ page }) => {
  for (const width of [420, 520, 760, 1100]) {
    await page.setViewportSize({ width, height: 1400 })
    for (const story of ["expanded", "orchestrator", "ops", "versions", "beyond-code", "narrow"]) {
      await page.goto(`/iframe.html?id=agentmanager--splash-${story}-story&viewMode=story`)
      await expect(page.locator(".am-splash-hero")).toBeVisible()
      await page.evaluate(() => document.fonts.ready)
      const heights: number[] = []
      for (const dot of await page.locator(".am-splash-dot").all()) {
        await dot.click()
        heights.push(await page.locator(".am-splash-hero").evaluate((node) => node.getBoundingClientRect().height))
      }
      expect(Math.max(...heights) - Math.min(...heights), `${story} at ${width}px`).toBe(0)
    }
  }
})

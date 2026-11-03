import AxeBuilder from "@axe-core/playwright"
import { expect, test, type Page } from "@playwright/test"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const { anchor } =
  require("../webview-ui/agent-manager/splash/anchor") as typeof import("../webview-ui/agent-manager/splash/anchor")
const { anchors } =
  require("../webview-ui/agent-manager/splash/anchors") as typeof import("../webview-ui/agent-manager/splash/anchors")
const { examples } =
  require("../webview-ui/agent-manager/splash/examples") as typeof import("../webview-ui/agent-manager/splash/examples")
const { fleet } =
  require("../webview-ui/agent-manager/splash/fleet") as typeof import("../webview-ui/agent-manager/splash/fleet")

const globals = "colorScheme:dark;theme:kilo-vscode;vscodeTheme:dark-modern"

for (const theme of ["dark-modern", "light-modern", "hc-black", "hc-light"]) {
  test(`marker numbers meet WCAG AA contrast in ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: 1010, height: 1400 })
    const scheme = theme === "light-modern" || theme === "hc-light" ? "light" : "dark"
    await page.goto(
      `/iframe.html?id=agentmanager--splash-ops-story&viewMode=story&globals=colorScheme:${scheme};theme:kilo-vscode;vscodeTheme:${theme}`,
    )
    await expect(page.locator(".am-splash-marker").first()).toBeVisible()
    for (const dot of await page.locator(".am-splash-dot").all()) {
      await dot.click()
      const ratios = await page.locator(".am-splash-marker").evaluateAll((markers) =>
        markers.map((marker) => {
          const luminance = (color: string) => {
            const channels = color
              .match(/[\d.]+/g)!
              .slice(0, 3)
              .map(Number)
              .map((value) => {
                const channel = value / 255
                return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
              })
            return channels.at(0)! * 0.2126 + channels.at(1)! * 0.7152 + channels.at(2)! * 0.0722
          }
          const style = getComputedStyle(marker)
          const foreground = luminance(style.color)
          const background = luminance(style.backgroundColor)
          return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05)
        }),
      )
      expect(Math.min(...ratios)).toBeGreaterThanOrEqual(4.5)
      const result = await new AxeBuilder({ page }).include(".am-splash-marker").withRules(["color-contrast"]).analyze()
      expect(result.violations).toEqual([])
    }
  })
}

async function open(page: Page, example = "ops") {
  await page.goto(
    `/iframe.html?id=agentmanager--splash-${example === "cross-stack" ? "ops" : example}-story&viewMode=story&globals=${globals}`,
  )
  await expect(page.locator(".am-splash-marker").first()).toBeVisible()
  if (example === "cross-stack") await page.locator(".am-splash-dot").first().click()
  await page.evaluate(() => document.fonts.ready)
}

async function alignment(page: Page) {
  const card = page.locator(".am-splash-preview-card")
  const id = await card.locator("..").getAttribute("data-tone")
  const example = examples.find((example) => example.id === id)!
  // Serialize the real, closure-free resolver so this also works with CI's static Storybook build.
  const resolver = await page.evaluateHandle<typeof anchor>(`(${anchor.toString()})`)
  const result = await card.evaluate(
    (card, { resolver, entries, targets }) => {
      const panel = card.querySelector<HTMLElement>(".am-splash-preview-panel-active")!
      const list = panel.querySelector(".am-projects-list")!.getBoundingClientRect()
      const rows = targets.map((target) => resolver(panel, entries, target)!)
      const rects = rows.map((row) => row.getBoundingClientRect())
      const first = rows.toSorted((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top).at(0)!
      const inset = first.matches(".am-project-item")
        ? 0
        : first.closest(".am-project")!.querySelector(".am-project-item")!.getBoundingClientRect().height
      const fits =
        Math.max(...rects.map((rect) => rect.bottom)) - Math.min(...rects.map((rect) => rect.top)) <=
        list.height - 28 - inset
      const markers = [...card.querySelectorAll(".am-splash-marker")].map((marker) => marker.getBoundingClientRect())
      return {
        height: card.getBoundingClientRect().height,
        fits,
        attached: markers.every((marker, index) => {
          const row = rects.at(index)!
          const center = marker.top + marker.height / 2
          return center >= row.top && center <= row.bottom
        }),
        visible: rects.every((row, index) => {
          const chrome = rows
            .at(index)!
            .closest(".am-project")!
            .querySelector(".am-project-item")!
            .getBoundingClientRect()
          return (
            row.top >= list.top &&
            row.bottom <= list.bottom - 27 &&
            (rows.at(index)!.matches(".am-project-item") || row.top >= chrome.bottom)
          )
        }),
        safe: markers.every((marker, index) => {
          const row = rects.at(index)!
          const center = marker.top + marker.height / 2
          if (center >= row.top && center <= row.bottom && row.top >= list.top && row.bottom <= list.bottom - 27)
            return true
          return (
            marker.top >= list.top + 34 &&
            marker.bottom <= list.bottom - 28 &&
            [...panel.querySelectorAll(".am-project-item")].every((header) => {
              const rect = header.getBoundingClientRect()
              return marker.bottom <= rect.top || marker.top >= rect.bottom
            })
          )
        }),
      }
    },
    { resolver, entries: fleet(example), targets: anchors[example.id] },
  )
  await resolver.dispose()
  return result
}

for (const [width, height] of [
  [520, 340],
  [720, 360],
  [1010, 428],
] as const) {
  for (const example of ["cross-stack", "orchestrator", "ops", "versions", "beyond-code"]) {
    test(`${example} anchors stay attached when their span fits the ${height}px frame`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 1400 })
      await open(page, example)
      const check = async () => {
        await expect
          .poll(async () => {
            const result = await alignment(page)
            return result.height === height && result.safe && (!result.fits || (result.attached && result.visible))
          })
          .toBe(true)
      }
      await check()
      const markers = page.locator(".am-splash-marker")
      for (const marker of await markers.all()) {
        await marker.click()
        await check()
      }
      await markers.first().click()
      await check()
      if ((width === 520 || width === 1010) && (example === "ops" || example === "cross-stack")) {
        await expect(markers.first()).toHaveAttribute("aria-expanded", "true")
        await page
          .locator(".am-splash")
          .screenshot({ path: info.outputPath(`preview-${example}-${width}-highlighted.png`) })
      }
    })
  }
}

for (const width of [520, 1010]) {
  test(`preview exposes only markers to focus and accessibility at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1400 })
    await open(page)
    const card = page.locator(".am-splash-preview-card")
    const markers = card.locator(".am-splash-marker")
    await expect(markers).toHaveCount(3)
    await expect(markers.first()).toHaveAccessibleName("Feature 1: Standing instructions")
    expect(
      await card.evaluate((root) =>
        [...root.querySelectorAll<HTMLElement>("*")]
          .filter((el) => el.tabIndex >= 0)
          .every((el) => el.matches(".am-splash-marker")),
      ),
    ).toBe(true)
    await markers.first().focus()
    await expect(markers.first()).toBeFocused()
    await page.keyboard.press("ArrowUp")
    await expect(markers.nth(2)).toBeFocused()
    await expect(markers.nth(2)).toHaveAttribute("aria-expanded", "true")
    await expect(page.locator(".am-splash-example-panel-active .am-splash-feature-highlight")).toContainText(
      "Needs-you alerts",
    )
    expect(
      await markers.nth(2).evaluate((el) => {
        const id = el.getAttribute("aria-controls")!
        const target = document.getElementById(id)
        return !!target && !target.closest('[aria-hidden="true"]') && !el.closest('[aria-hidden="true"]')
      }),
    ).toBe(true)
    expect(
      await card.evaluate((root) => {
        const panel = root.querySelector(".am-splash-preview-panel-active")!
        const row = [...panel.querySelectorAll<HTMLElement>(".am-worktree-item")].find((el) =>
          el.textContent?.includes("Adversarial Reviewer"),
        )!
        const list = panel.querySelector(".am-projects-list")!
        return row.getBoundingClientRect().bottom <= list.getBoundingClientRect().bottom - 27
      }),
    ).toBe(true)
    await page.keyboard.press("ArrowRight")
    await expect(markers.first()).toBeFocused()
    await page.keyboard.press("Enter")
    await expect(markers.first()).toHaveAttribute("aria-expanded", "false")
    await page.keyboard.press("Space")
    await expect(markers.first()).toHaveAttribute("aria-expanded", "true")
    const result = await new AxeBuilder({ page })
      .include(".am-splash-preview-card")
      .exclude(".am-splash-preview-stack")
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze()
    expect(result.violations).toEqual([])
    await page.locator(".am-splash").screenshot({ path: info.outputPath(`preview-${width}-highlighted.png`) })
    await expect(page.locator(".am-splash-legend")).toBeVisible({ visible: width === 1010 })
  })
}

test("feature hover highlights its marker without activating real rows or hover portals", async ({ page }) => {
  await page.setViewportSize({ width: 1010, height: 1400 })
  await open(page, "versions")
  const marker = page.locator(".am-splash-marker").nth(1)
  const feature = page.locator(".am-splash-example-panel-active .am-splash-feature").nth(1)
  await feature.hover()
  await expect(marker).toHaveClass(/am-splash-marker-highlight/)
  await expect(feature).toHaveClass(/am-splash-feature-highlight/)
  await page.locator(".am-splash-title").hover()
  await expect(marker).not.toHaveClass(/am-splash-marker-highlight/)
  const row = page.locator(".am-splash-preview-panel-active .am-worktree-item").first()
  await row.hover()
  await expect(page.locator(".am-worktree-hover-card[data-expanded], .am-hover-card")).toHaveCount(0)
  await row.click({ position: { x: 15, y: 15 } })
  await row.evaluate((el) => (el as HTMLElement).focus())
  await expect(row).not.toBeFocused()
  await expect(page.locator(".am-splash-preview-panel-active .am-worktree-item-active .am-wt-name")).toContainText(
    "Claude",
  )
})

test("markers remeasure against their real rows on resize and example changes", async ({ page }) => {
  await page.setViewportSize({ width: 1010, height: 1400 })
  await open(page, "versions")
  for (const width of [1010, 520, 720]) {
    await page.setViewportSize({ width, height: 1400 })
    await expect
      .poll(() =>
        page.locator(".am-splash-preview-card").evaluate((card) => {
          const panel = card.querySelector(".am-splash-preview-panel-active")!
          const row = panel.querySelector(".am-wt-group-header")!.getBoundingClientRect()
          const marker = card.querySelector(".am-splash-marker")!.getBoundingClientRect()
          return Math.abs(marker.top + marker.height / 2 - row.top - row.height / 2)
        }),
      )
      .toBeLessThan(2)
  }
  await page.getByRole("button", { name: /Show example: Staff a standing ops crew/ }).click()
  await expect(page.locator(".am-splash-marker").first()).toHaveAccessibleName("Feature 1: Standing instructions")
  await expect(page.locator(".am-splash-marker[aria-expanded=true]")).toHaveCount(0)
})

test("all five examples resolve three visible marker controls and support pointer toggles", async ({ page }) => {
  await page.setViewportSize({ width: 520, height: 1400 })
  for (const example of ["narrow", "orchestrator", "ops", "versions", "beyond-code"]) {
    await open(page, example)
    const markers = page.locator(".am-splash-marker")
    for (const marker of await markers.all()) {
      await expect(marker).toBeVisible()
      expect(await marker.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe("rgba(0, 0, 0, 0)")
      await marker.click()
      await expect(marker).toHaveAttribute("aria-expanded", "true")
      await marker.click()
      await expect(marker).toHaveAttribute("aria-expanded", "false")
    }
  }
})

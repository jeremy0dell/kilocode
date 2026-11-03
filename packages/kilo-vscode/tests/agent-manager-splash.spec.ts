import AxeBuilder from "@axe-core/playwright"
import { expect, test, type Page } from "@playwright/test"

const globals = "colorScheme:dark;theme:kilo-vscode;vscodeTheme:dark-modern"

async function open(page: Page, example = "ops") {
  await page.goto(`/iframe.html?id=agentmanager--splash-${example}-story&viewMode=story&globals=${globals}`)
  await expect(page.locator(".am-splash-marker").first()).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
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

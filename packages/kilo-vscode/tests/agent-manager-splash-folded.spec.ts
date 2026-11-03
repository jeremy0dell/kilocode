import { expect, test } from "@playwright/test"

test("splash primary CTA requests a worktree", async ({ page }) => {
  await page.goto("/iframe.html?id=agentmanager--splash-expanded-story&viewMode=story")
  await page.locator(".am-splash-actions").getByRole("button", { name: "Create Worktree", exact: true }).click()
  await expect(page.getByTestId("splash-created")).toHaveText("Worktree requested")
})

test("local helper supports pointer and keyboard composer focus", async ({ page }) => {
  await page.goto("/iframe.html?id=agentmanager--splash-actions-story&viewMode=story")
  const link = page.getByRole("button", { name: "proceed locally in the message box below", exact: true })
  const composer = page.getByRole("textbox", { name: "Local prompt" })
  await expect(page.locator(".am-splash-hint")).toHaveText("or proceed locally in the message box below")
  await expect(link).toHaveCSS("cursor", "pointer")
  await link.hover()
  await expect(link).toHaveCSS("text-decoration-line", "underline")
  await link.click()
  await expect(composer).toBeFocused()
  for (const key of ["Enter", "Space"]) {
    await page.keyboard.press("Tab")
    await link.focus()
    await expect(link).toHaveCSS("text-decoration-line", "underline")
    await link.press(key)
    await expect(composer).toBeFocused()
  }
  await expect(page.getByTestId("splash-created")).toBeHidden()
})

for (const width of [300, 440, 599, 600, 720, 1010, 1400]) {
  test(`folded bar stays in one row at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width: width + 64, height: 800 })
    await page.goto("/iframe.html?id=agentmanager--splash-folded-story&viewMode=story")
    const bar = page.locator(".am-splash-folded")
    await expect(bar).toBeVisible()
    await page.locator(".am-splash-folded-layout").evaluate((el, width) => {
      el.style.width = `${width}px`
    }, width)
    await page.evaluate(() => document.fonts.ready)
    await bar.locator("img").evaluate((el) => el.decode())

    const title = bar.locator(".am-splash-folded-title")
    const note = bar.locator(".am-splash-folded-note")
    const show = bar.getByRole("button", { name: "Show examples" })
    await expect(note).toBeVisible({ visible: width >= 600 })
    await expect(title).toHaveCSS("white-space", width < 600 ? "normal" : "nowrap")
    await expect(bar).toHaveCSS("flex-direction", "row")
    await expect(bar).toHaveCSS("border-radius", "6px")
    await expect(bar).toHaveCSS("padding", "10px 14px")
    expect(await note.getAttribute("title")).toBe(await note.textContent())

    const bounds = await bar.evaluate((el) => {
      const rect = (selector: string) => el.querySelector(selector)!.getBoundingClientRect()
      const box = el.getBoundingClientRect()
      const title = rect(".am-splash-folded-title")
      const logo = rect(".am-splash-folded-logo")
      const button = rect(".am-splash-show")
      return {
        width: box.width,
        overflow: el.scrollWidth > el.clientWidth,
        overlap: title.right > button.left,
        centered: Math.abs(logo.top + logo.height / 2 - (button.top + button.height / 2)),
        truncated: el.querySelector(".am-splash-folded-title")!.scrollWidth > title.width + 1,
      }
    })
    expect(bounds.width).toBeLessThanOrEqual(Math.min(width, 1120))
    expect(bounds.overflow).toBe(false)
    expect(bounds.overlap).toBe(false)
    expect(bounds.centered).toBeLessThan(1)
    expect(bounds.truncated).toBe(false)

    if ([440, 720, 1010].includes(width)) {
      await page.screenshot({ path: test.info().outputPath(`folded-${width}.png`) })
    }
    await show.click()
    await expect(page.locator(".am-splash-hero")).toBeVisible()
    await page.locator(".am-splash-hide").click()
    await expect(bar).toBeVisible()
  })
}

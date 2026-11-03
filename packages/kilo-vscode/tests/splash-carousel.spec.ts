import { test, expect } from "@playwright/test"

for (const width of [520, 1010]) {
  test(`splash carousel preserves RTL navigation at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto("/iframe.html?id=agentmanager--splash-arabic-story&viewMode=story")
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl")
    const cards = page.locator(".am-splash-card")
    const track = page.locator(".am-splash-cards")
    for (const index of [0, 1, 2, 3, 4]) {
      await page.locator(".am-splash-dot").nth(index).click()
      await expect(cards.nth(index)).toHaveAttribute("aria-current", "true")
      await expect
        .poll(() =>
          track.evaluate((node, index) => {
            const card = node.children.item(Math.max(0, Math.min(index - 1, 2)))!
            return Math.abs(card.getBoundingClientRect().right - node.getBoundingClientRect().right)
          }, index),
        )
        .toBeLessThan(1)
    }
    await cards.last().focus()
    await page.keyboard.press("ArrowLeft")
    await expect(cards.first()).toBeFocused()
    await page.keyboard.press("ArrowRight")
    await expect(cards.last()).toBeFocused()
  })

  test(`splash carousel keeps all copy and stable geometry at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto("/iframe.html?id=agentmanager--splash-cross-stack-story&viewMode=story")
    const hero = page.locator(".am-splash-hero")
    const cards = page.locator(".am-splash-card")
    const track = page.locator(".am-splash-cards")
    const dots = page.locator(".am-splash-dot")
    await expect(cards).toHaveCount(5)
    await expect(dots).toHaveCount(5)
    await expect(page.locator(".am-splash-hint")).toHaveText("or describe a task below")
    await page.evaluate(() => document.fonts.ready)
    const height = (await hero.boundingBox())!.height
    const heights = await cards.evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().height))
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(1)
    const expected = ((await track.boundingBox())!.width - 20) / 3
    expect(Math.abs((await cards.first().boundingBox())!.width - expected)).toBeLessThan(1)

    for (const index of [0, 1, 2, 3, 4]) {
      await dots.nth(index).click()
      await expect(cards.nth(index)).toHaveAttribute("aria-current", "true")
      await expect.poll(async () => (await hero.boundingBox())!.height).toBe(height)
      await expect
        .poll(() =>
          track.evaluate((node, index) => {
            const card = node.children.item(Math.max(0, Math.min(index - 1, 2)))!
            return Math.abs(card.getBoundingClientRect().left - node.getBoundingClientRect().left)
          }, index),
        )
        .toBeLessThan(1)
      const content = page.locator(".am-splash-example-panel-active")
      await expect(content.locator(".am-splash-feature-marker")).toHaveText(["1", "2", "3"])
      const contrast = await content
        .locator(".am-splash-feature-marker")
        .first()
        .evaluate((node) => {
          const style = getComputedStyle(node)
          const canvas = document.createElement("canvas").getContext("2d")!
          const luminance = (color: string) => {
            canvas.fillStyle = color
            canvas.fillRect(0, 0, 1, 1)
            const rgb = [...canvas.getImageData(0, 0, 1, 1).data].slice(0, 3).map((value) => {
              const channel = value / 255
              return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
            })
            return rgb.reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722].at(index)!, 0)
          }
          const background = luminance(style.backgroundColor)
          const foreground = luminance(style.color)
          return (Math.max(background, foreground) + 0.05) / (Math.min(background, foreground) + 0.05)
        })
      expect(contrast).toBeGreaterThanOrEqual(4.5)
      const clipped = await page.locator(".am-splash-card-title, .am-splash-pitch").evaluateAll((nodes) =>
        nodes.some((node) => {
          const style = getComputedStyle(node)
          return (
            style.webkitLineClamp !== "none" ||
            node.scrollHeight > node.clientHeight + 1 ||
            node.scrollWidth > node.clientWidth + 1
          )
        }),
      )
      expect(clipped).toBe(false)
    }
    await page.getByRole("button", { name: "Next example", exact: true }).click()
    await expect(cards.first()).toHaveAttribute("aria-current", "true")
    await page.getByRole("button", { name: "Previous example", exact: true }).click()
    await expect(cards.last()).toHaveAttribute("aria-current", "true")
    await cards.last().focus()
    await page.keyboard.press("ArrowRight")
    await expect(cards.first()).toBeFocused()
    await page.keyboard.press("End")
    await expect(cards.last()).toBeFocused()
    await page.keyboard.press("Home")
    await expect(cards.first()).toBeFocused()
    await page.screenshot({ fullPage: true, path: info.outputPath(`splash-${width}.png`) })
  })

  test(`splash German titles wrap without clipping at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1200 })
    await page.goto("/iframe.html?id=agentmanager--splash-german-story&viewMode=story")
    await expect(page.locator("html")).toHaveAttribute("lang", "de")
    const hero = page.locator(".am-splash-hero")
    const height = (await hero.boundingBox())!.height
    for (const dot of await page.locator(".am-splash-dot").all()) {
      await dot.click()
      expect((await hero.boundingBox())!.height).toBe(height)
      const clipped = await page
        .locator(".am-splash-card-title, .am-splash-pitch")
        .evaluateAll((nodes) =>
          nodes.some((node) => node.scrollHeight > node.clientHeight + 1 || node.scrollWidth > node.clientWidth + 1),
        )
      expect(clipped).toBe(false)
    }
    await page.screenshot({ fullPage: true, path: info.outputPath(`splash-de-${width}.png`) })
  })
}

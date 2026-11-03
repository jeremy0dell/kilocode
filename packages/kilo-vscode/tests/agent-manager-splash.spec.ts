import AxeBuilder from "@axe-core/playwright"
import { expect, test, type Page } from "@playwright/test"

async function open(page: Page, theme = "dark-modern", locale = "en") {
  await page.goto(
    `/iframe.html?id=agentmanager--splash-french-story&viewMode=story&globals=theme:kilo-vscode;vscodeTheme:${theme}&args=locale:${locale}`,
  )
  await expect(page.locator(".am-splash-hero")).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
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

  for (const width of [420, 1100]) {
    test(`${theme} at ${width}px hero and preview pass axe, including nested-interactive and aria-hidden-focus`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 1400 })
      await open(page, theme)
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
          result.violations,
        )
        expect(violations).toEqual([])
      }
    })
  }

  for (const width of [420, 520, 760, 1100]) {
    test(`${theme} at ${width}px keeps all five hero heights stable and tags readable`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1400 })
      await open(page, theme)
      const heights: number[] = []
      const ratios: number[] = []
      const controls = page.locator(width < 880 ? ".am-splash-tab" : ".am-splash-dot")
      await expect(controls).toHaveCount(5)
      for (const control of await controls.all()) {
        await control.click()
        heights.push(await page.locator(".am-splash-hero").evaluate((node) => node.getBoundingClientRect().height))
        if (width < 880) {
          await expect(page.locator(".am-splash-compact-panel-active")).toBeVisible()
          expect(
            await page.locator(".am-splash-compact-preview").evaluate((node) => node.getBoundingClientRect().height),
          ).toBe(276)
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
      console.log(JSON.stringify({ theme, width, heights, ratios }))
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
      await row.click()
      expect(await page.evaluate(() => document.activeElement?.closest(".am-splash-preview-card") != null)).toBe(false)
    }
  }
})

test("carousel announces selections and excludes the preview from forward and reverse focus traversal", async ({
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

test("visible compact preview rows retain native hover inside the faded frame", async ({ page }) => {
  await page.setViewportSize({ width: 520, height: 1400 })
  await open(page)
  for (const tab of await page.locator(".am-splash-tab").all()) {
    await tab.click()
    const row = page.locator(".am-splash-compact-panel-active .am-splash-preview-panel-active .am-worktree-item-active")
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
  for (const width of [420, 520, 760]) {
    test(`${locale} at ${width}px frames each example's defining content above the fade`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1400 })
      await open(page, "dark-modern", locale)
      for (let index = 0; index < 5; index++) {
        await page.locator(".am-splash-tab").nth(index).click()
        const frame = page.locator(".am-splash-compact-preview")
        const panel = frame.locator(".am-splash-preview-panel-active")
        const rows = panel.locator(".am-worktree-item")
        // Query the real fixtures by their story content, independently of the framing implementation.
        const targets = [panel.locator(".am-worktree-item-active")]
        if (index === 0) {
          targets.push(
            rows.filter({ hasText: "#889" }),
            rows.filter({ hasText: "queue and alarms" }),
            panel.locator(".am-project-item").filter({ hasText: "web-app" }),
          )
          await expect(rows.filter({ hasText: "queue and alarms" }).locator('[data-activity="waiting"]')).toHaveCount(1)
        }
        if (index === 1) targets.push(panel.locator(".am-section-group-header").filter({ hasText: "ORCHESTRATE" }))
        if (index === 2) {
          const implementation = panel.locator(".am-section-group-header").filter({ hasText: "IMPLEMENT" })
          await expect(implementation).toContainText("3")
          await expect(implementation.locator(".am-sidebar-header-toggle")).toHaveAttribute("aria-expanded", "false")
          await expect(rows.filter({ hasText: "Rate-limit the login endpoint" })).toHaveCount(0)
          targets.push(
            implementation,
            panel.locator(".am-section-group-header").filter({ hasText: /^OPS/ }),
            rows.filter({ hasText: "Merge Captain" }),
            rows.filter({ hasText: "Issue Delegator" }),
          )
          await expect(panel.locator('.am-worktree-item-active [data-activity="waiting"]')).toHaveCount(1)
          await expect(panel.locator(".am-worktree-item-active")).toContainText("Adversarial Reviewer")
        }
        if (index === 3) {
          await expect(rows).toHaveCount(3)
          targets.push(panel.locator(".am-wt-group-header"), ...(await rows.all()))
        }
        if (index === 4) {
          targets.push(
            rows.filter({ hasText: "monogram" }),
            rows.filter({ hasText: "Color and type tokens" }),
            rows.filter({ hasText: "Social card templates" }),
          )
        }
        for (const target of targets) {
          await expect
            .poll(async () => {
              const bounds = await target.boundingBox()
              const crop = await frame.boundingBox()
              if (!bounds || !crop) return false
              return bounds.y >= crop.y - 0.5 && bounds.y + bounds.height <= crop.y + crop.height * 0.78
            })
            .toBe(true)
        }
        expect(await frame.evaluate((node) => node.scrollTop)).toBeGreaterThan(0)
      }
      // Re-measure the active example after a compact-to-compact resize, not just a fresh mount.
      await page.setViewportSize({ width: width === 760 ? 520 : 760, height: 1400 })
      await page.setViewportSize({ width, height: 1400 })
      await expect
        .poll(() =>
          page.locator(".am-splash-compact-preview").evaluate((node) => {
            const frame = node.getBoundingClientRect()
            const row = node
              .querySelector(".am-splash-preview-panel-active .am-worktree-item-active")!
              .getBoundingClientRect()
            return row.top >= frame.top - 0.5 && row.bottom <= frame.top + frame.height * 0.78
          }),
        )
        .toBe(true)
    })
  }
}

for (const locale of ["en", "ar"]) {
  test(`${locale} wide-to-compact examples are anchored on their first animation frame`, async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 1400 })
    await open(page, "dark-modern", locale)
    const labels = [
      ["pricing page", "queue and alarms", "web-app"],
      ["Orchestrator · scheduler latency pass", "ORCHESTRATE"],
      ["IMPLEMENT", "OPS", "Merge Captain", "Issue Delegator", "Adversarial Reviewer"],
      ["Kilo Auto", "Claude", "GPT"],
      ["wordmark", "monogram", "Color and type tokens", "Social card templates"],
    ]
    for (let index = 0; index < 5; index++) {
      await page.locator(".am-splash-dot").nth(index).click()
      const first = await page.evaluate((labels) => {
        const pane = document.querySelector<HTMLElement>('.am-intro-layout > [data-slot="message-list"]')!
        const result = Promise.withResolvers<{
          height: number
          scroll: number
          rows: ({ label: string; top: number; bottom: number } | null)[]
        }>()
        // Queue sampling before the resize observer mounts Compact, so a deferred initial anchor loses this race.
        const sample = () => {
          const frame = pane.querySelector<HTMLElement>(".am-splash-compact-preview")
          if (!frame) {
            requestAnimationFrame(sample)
            return
          }
          const bounds = frame.getBoundingClientRect()
          const nodes = [
            ...frame.querySelectorAll(
              ".am-splash-preview-panel-active .am-worktree-item,.am-splash-preview-panel-active .am-section-group-header,.am-splash-preview-panel-active .am-project-item",
            ),
          ]
          result.resolve({
            height: bounds.height,
            scroll: frame.scrollTop,
            rows: labels.map((label) => {
              const node = nodes.find((node) => node.textContent?.includes(label))
              if (!node) return null
              const row = node.getBoundingClientRect()
              return { label, top: row.top - bounds.top, bottom: row.bottom - bounds.top }
            }),
          })
        }
        requestAnimationFrame(sample)
        pane.style.flex = "none"
        pane.style.width = "520px"
        return result.promise
      }, labels.at(index)!)
      expect(first.height).toBe(276)
      expect(first.scroll).toBeGreaterThan(0)
      for (const row of first.rows) {
        expect(row).not.toBeNull()
        if (!row) continue
        expect(row.top, row.label).toBeGreaterThanOrEqual(-0.5)
        expect(row.bottom, row.label).toBeLessThanOrEqual(first.height * 0.78)
      }
      await page.locator('.am-intro-layout > [data-slot="message-list"]').evaluate((node) => {
        ;(node as HTMLElement).style.width = "1100px"
      })
      await expect(page.locator(".am-splash-wide")).toBeVisible()
    }
  })
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
    await expect(page.locator(".am-splash-wide")).toBeVisible()
    await page.setViewportSize({ width: 520, height: 1400 })
    await expect(page.getByRole("tab")).toHaveCount(5)
    await page.setViewportSize({ width: 1100, height: 1400 })
    await expect(page.locator(".am-splash-wide")).toBeVisible()
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
      const clipped = await page.locator(".am-splash-compact-panel-active").evaluate((node) =>
        [...node.children]
          // The pitch clamps to two lines and the real preview intentionally crops at 276px.
          .filter((child) => child.matches(".am-splash-compact-features"))
          .filter((child) => child.scrollHeight > child.clientHeight + 1 || child.scrollWidth > child.clientWidth + 1)
          .map((child) => child.textContent),
      )
      expect(clipped).toEqual([])
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
    await expect(page.locator('.am-splash-show [data-component="icon"][data-directional]')).toHaveCount(1)
    expect(await scales(page, ".am-splash-show")).toEqual([scale])
    await page.locator(".am-splash-show").click()
    await expect(page.locator(".am-splash-wide")).toBeVisible()
    expect(await scales(page, ".am-splash-arrow")).toEqual([scale, scale])
    await page.locator(".am-splash-hide").click()
    await expect(page.locator(".am-splash-show")).toBeVisible()
    expect(await scales(page, ".am-splash-show")).toEqual([scale])
    await page.locator(".am-splash-show").click()
    await expect(page.locator(".am-splash-wide")).toBeVisible()
    expect(await scales(page, ".am-splash-arrow")).toEqual([scale, scale])
    await page.setViewportSize({ width: 760, height: 1400 })
    await expect(page.getByRole("tab")).toHaveCount(5)
    // Compact tabs have no chevrons or splash-owned directional icons to mirror.
    await expect(page.locator('.am-splash-tab [data-slot="icon-svg"]')).toHaveCount(0)
    await page.setViewportSize({ width: 1100, height: 1400 })
    await expect(page.locator(".am-splash-wide")).toBeVisible()
    expect(await scales(page, ".am-splash-arrow")).toEqual([scale, scale])
  })
}

test("reduced motion disables only splash-owned control motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await open(page)
  const durations = await page
    .locator(".am-splash-hero-main button:not(.am-splash-preview-card button)")
    .evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).transitionDuration))
  expect(durations.every((duration) => duration === "0s")).toBe(true)
})

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
        await expect(tab).toHaveAttribute("aria-controls", (await panel.getAttribute("id"))!)
        await expect(panel).toHaveAttribute("role", "tabpanel")
        await expect(panel).toHaveAttribute("aria-labelledby", (await tab.getAttribute("id"))!)
        await expect(panel).toHaveAttribute("tabindex", position === index ? "0" : "-1")
        if (position !== index) {
          await expect(panel).toBeHidden()
          await expect(panel.locator(".am-splash-preview-card")).toHaveCount(0)
          continue
        }
        await expect(panel.locator(".am-splash-preview-card")).toHaveAttribute("role", "figure")
        await expect(panel).toHaveClass(/am-splash-compact-panel-active/)
        await expect(panel).toBeVisible()
      }
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

test("compact forward and reverse focus traversal includes the panel but excludes every preview", async ({ page }) => {
  await page.setViewportSize({ width: 420, height: 1400 })
  await open(page)
  const hide = page.getByRole("button", { name: "Hide Agent Manager introduction", exact: true })
  const start = page.getByRole("button", { name: "Start your first session", exact: true })
  for (const tab of await page.locator(".am-splash-tab").all()) {
    await tab.click()
    const panel = page.locator(".am-splash-compact-panel-active")
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

test("the 880px container breakpoint fits the wide carousel and preserves selection across remounts", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 1400 })
  await open(page)
  const pane = page.locator('.am-intro-layout > [data-slot="message-list"]')
  for (const width of [879, 880, 760, 1100]) {
    await pane.evaluate((node, width) => {
      const pane = node as HTMLElement
      pane.style.flex = "none"
      pane.style.width = `${width}px`
    }, width)
    await expect.poll(() => pane.evaluate((node) => node.getBoundingClientRect().width)).toBe(width)
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
    const bounds = (await pane.boundingBox())!
    for (const card of await page.locator(".am-splash-card, .am-splash-preview-card").all()) {
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
      await page.goto(`/iframe.html?id=agentmanager--splash-${story}-story&viewMode=story`)
      const card = page.locator(".am-splash-hero, .am-splash-folded")
      await expect(card).toBeVisible()
      await page.evaluate(() => document.fonts.ready)
      const root = (await page.locator("#storybook-root").boundingBox())!
      const hero = (await card.boundingBox())!
      expect(root.height, `${story} at ${width}px root height`).toBeGreaterThanOrEqual(hero.height)
      expect(hero.x).toBeGreaterThanOrEqual(root.x)
      expect(hero.y).toBeGreaterThanOrEqual(root.y)
      expect(hero.x + hero.width).toBeLessThanOrEqual(root.x + root.width)
      expect(hero.y + hero.height).toBeLessThanOrEqual(root.y + root.height)
      if (story === "folded") continue
      const heights: number[] = []
      const controls = page.locator(".am-splash-tab, .am-splash-dot")
      await expect(controls).toHaveCount(5)
      for (const control of await controls.all()) {
        await control.click()
        heights.push(await page.locator(".am-splash-hero").evaluate((node) => node.getBoundingClientRect().height))
      }
      expect(heights).toHaveLength(5)
      expect(Math.max(...heights) - Math.min(...heights), `${story} at ${width}px`).toBe(0)
    }
  }
})

import AxeBuilder from "@axe-core/playwright"
import { expect, test, type Page } from "@playwright/test"
import { createRequire } from "node:module"
import { contrast } from "./contrast"
import { ready } from "./story-locale"

const require = createRequire(import.meta.url)
const { anchor } =
  require("../webview-ui/agent-manager/splash/anchor") as typeof import("../webview-ui/agent-manager/splash/anchor")
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
    const kind = {
      "dark-modern": "vscode-dark",
      "light-modern": "vscode-light",
      "hc-black": "vscode-high-contrast",
      "hc-light": "vscode-high-contrast-light",
    }[theme]!
    await expect(page.locator("body")).toHaveClass(new RegExp(kind))
    await expect(page.locator("html")).toHaveAttribute("data-color-scheme", scheme)
    for (const dot of await page.locator(".am-splash-dot").all()) {
      await dot.click()
      const ratios = await page.locator(".am-splash-marker").evaluateAll(contrast)
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
  if (example === "cross-stack") await page.locator(".am-splash-tab, .am-splash-dot").first().click()
  await ready(page, "en")
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
    { resolver, entries: fleet(example), targets: example.features.map((feature) => feature.anchor) },
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
      const attribute = width < 560 ? "aria-expanded" : "aria-pressed"
      for (const marker of await markers.all()) {
        if ((await marker.getAttribute(attribute)) !== "true") await marker.click()
        await expect(marker).toHaveAttribute(attribute, "true")
        await check()
      }
      if ((await markers.first().getAttribute(attribute)) !== "true") await markers.first().click()
      await check()
      if ((width === 520 || width === 1010) && (example === "ops" || example === "cross-stack")) {
        await expect(markers.first()).toHaveAttribute(attribute, "true")
        await page
          .locator(".am-splash")
          .screenshot({ path: info.outputPath(`preview-${example}-${width}-highlighted.png`) })
      }
    })
  }
}

for (const locale of ["arabic", "persian"]) {
  test(`${locale} preview markers remain fully inside the frame and pointer reachable after resize`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 520, height: 1400 })
    await page.goto(`/iframe.html?id=agentmanager--splash-${locale}-story&viewMode=story&globals=${globals}`)
    await ready(page, locale === "arabic" ? "ar" : "fa")
    const markers = page.locator(".am-splash-marker")
    await expect(markers.first()).toHaveAccessibleName(locale === "arabic" ? /^الميزة 1: / : /^قابلیت 1: /)
    for (const width of [520, 1010, 720]) {
      await page.setViewportSize({ width, height: 1400 })
      for (const index of [0, 1, 2, 3, 4]) {
        const controls = page.locator(width < 880 ? ".am-splash-tab" : ".am-splash-dot")
        await expect(controls).toHaveCount(5)
        await controls.nth(index).click()
        for (const marker of await markers.all()) {
          const attribute = width < 560 ? "aria-expanded" : "aria-pressed"
          if ((await marker.getAttribute(attribute)) === "true") await marker.click()
          await marker.scrollIntoViewIfNeeded()
          await expect
            .poll(() =>
              marker.evaluate((node) => {
                const rect = node.getBoundingClientRect()
                const frame = node.closest(".am-splash-preview-card")!.getBoundingClientRect()
                return (
                  rect.width === 16 &&
                  rect.left >= frame.left + 1 &&
                  rect.right <= frame.right - 1 &&
                  document.elementFromPoint(rect.left + 8, rect.top + 8) === node
                )
              }),
            )
            .toBe(true)
          const rect = (await marker.boundingBox())!
          await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2)
          await expect(marker).toHaveAttribute(attribute, "true")
          await expect(marker).not.toHaveAttribute(width < 560 ? "aria-pressed" : "aria-expanded")
          await marker.click()
          await expect(marker).toHaveAttribute(attribute, "false")
        }
        if (locale === "arabic" && index === 2 && width !== 720) {
          await markers.first().click()
          await page.locator(".am-splash").screenshot({ path: info.outputPath(`preview-ar-${width}-highlighted.png`) })
        }
      }
    }
  })
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
    const attribute = width < 560 ? "aria-expanded" : "aria-pressed"
    await expect(markers.nth(2)).toHaveAttribute(attribute, "true")
    await expect(
      page.locator(width < 560 ? ".am-splash-popover" : ".am-splash-features-active .am-splash-feature-highlight"),
    ).toContainText("Needs-you alerts")
    if (width < 560) {
      expect(
        await markers.nth(2).evaluate((el) => {
          const id = el.getAttribute("aria-controls")!
          const target = document.getElementById(id)
          return !!target && !target.closest('[aria-hidden="true"]') && !el.closest('[aria-hidden="true"]')
        }),
      ).toBe(true)
    }
    if (width >= 560) await expect(markers.nth(2)).not.toHaveAttribute("aria-controls")
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
    await expect(markers.first()).toHaveAttribute(attribute, "false")
    await page.keyboard.press("Space")
    await expect(markers.first()).toHaveAttribute(attribute, "true")
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
  const feature = page.locator(".am-splash-features-active .am-splash-feature").nth(1)
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
  await page.locator(".am-splash-tab, .am-splash-dot").nth(2).click()
  await expect(page.locator(".am-splash-marker").first()).toHaveAccessibleName("Feature 1: Standing instructions")
  await expect(page.locator(".am-splash-marker[aria-pressed=true]")).toHaveCount(0)
})

test("all five examples resolve three visible marker controls and support pointer toggles", async ({ page }) => {
  await page.setViewportSize({ width: 520, height: 1400 })
  for (const example of ["narrow", "orchestrator", "ops", "versions", "beyond-code"]) {
    await open(page, example)
    const markers = page.locator(".am-splash-marker")
    await expect(markers).toHaveCount(3)
    for (const marker of await markers.all()) {
      await expect(marker).toBeVisible()
      expect(await marker.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe("rgba(0, 0, 0, 0)")
      if ((await marker.getAttribute("aria-expanded")) === "true") await marker.click()
      await marker.click()
      await expect(marker).toHaveAttribute("aria-expanded", "true")
      await expect(marker).not.toHaveAttribute("aria-pressed")
      await marker.click()
      await expect(marker).toHaveAttribute("aria-expanded", "false")
    }
  }
})

for (const locale of ["en", "ar"]) {
  for (const width of [1280, 1010, 900, 880, 879, 800, 720, 600, 560, 559, 500, 440, 380, 340, 320, 300]) {
    test(`${locale} prototype sweep at ${width}px preserves copy, height, anchors, and popover clearance`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1500, height: 1600 })
      await page.goto(
        `/iframe.html?id=agentmanager--splash-french-story&viewMode=story&globals=${globals}&args=locale:${locale}`,
      )
      await ready(page, locale)
      const root = page.locator(".am-splash")
      await expect(root).toBeVisible()
      await root.evaluate((node, width) => {
        const root = node as HTMLElement
        root.style.width = `${width}px`
        root.style.maxWidth = "none"
        root.style.boxSizing = "content-box"
        root.style.flex = "none"
      }, width)
      const thin = width < 560
      const controls = page.locator(width < 880 ? ".am-splash-tab" : ".am-splash-dot")
      await expect(controls).toHaveCount(5)
      const card = page.locator(".am-splash-preview-card")
      await expect
        .poll(() => card.evaluate((node) => node.getBoundingClientRect().height))
        .toBe(thin ? 340 : width < 880 ? 360 : 428)
      const resolver = await page.evaluateHandle<typeof anchor>(`(${anchor.toString()})`)
      const heights: number[] = []
      // Start elsewhere so every iteration exercises an actual example change and its automatic feature-1 opening.
      await controls.last().click()
      for (const [index, example] of examples.entries()) {
        await controls.nth(index).click()
        const markers = card.locator(".am-splash-marker")
        await expect(markers).toHaveCount(3)
        if (thin) {
          await expect(markers.first()).toHaveAttribute("aria-expanded", "true")
          await expect(page.locator(".am-splash-popover")).toBeVisible()
        }
        for (const [position, marker] of (await markers.all()).entries()) {
          const attribute = thin ? "aria-expanded" : "aria-pressed"
          await expect(marker).not.toHaveAttribute(thin ? "aria-pressed" : "aria-expanded")
          if (!thin) await expect(marker).not.toHaveAttribute("aria-controls")
          if ((await marker.getAttribute(attribute)) !== "true") await marker.click()
          await expect(marker).toHaveAttribute(attribute, "true")
          if (thin) {
            const popover = page.locator(".am-splash-popover")
            await expect(popover).toBeVisible()
            await expect(marker).toHaveAttribute("aria-controls", (await popover.getAttribute("id"))!)
          }
          await expect
            .poll(() =>
              card.evaluate(
                (card, { resolver, entries, target, position, thin, width }) => {
                  const root = card.closest<HTMLElement>(".am-splash")!
                  const panel = card.querySelector<HTMLElement>(".am-splash-preview-panel-active")!
                  const row = resolver(panel, entries, target)!.getBoundingClientRect()
                  const list = panel.querySelector(".am-projects-list")!.getBoundingClientRect()
                  const frame = card.getBoundingClientRect()
                  const markers = [...card.querySelectorAll<HTMLElement>(".am-splash-marker")]
                  const rects = markers.map((node) => node.getBoundingClientRect())
                  const marker = rects.at(position)!
                  const overlap = (a: DOMRect, b: DOMRect) =>
                    Math.min(a.right, b.right) > Math.max(a.left, b.left) &&
                    Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top)
                  const popover = root.querySelector<HTMLElement>(".am-splash-popover")
                  const pop = popover?.getBoundingClientRect()
                  const issues: string[] = []
                  for (const node of [root, root.querySelector<HTMLElement>(".am-splash-hero")!]) {
                    if (node.scrollWidth > node.clientWidth + 1) issues.push("horizontal overflow")
                  }
                  for (const node of root.querySelectorAll<HTMLElement>(
                    ".am-splash-title,.am-splash-subtitle,.am-splash-pitch,.am-splash-feature strong,.am-splash-feature-description,.am-splash-tab,.am-splash-hint,.am-splash-thin-hint,.am-splash-actions [data-component=button],.am-splash-popover__name,.am-splash-popover__text",
                  )) {
                    if (!node.checkVisibility()) continue
                    const style = getComputedStyle(node)
                    if (
                      !["none", "", "0"].includes(style.webkitLineClamp) ||
                      style.textOverflow === "ellipsis" ||
                      node.scrollHeight > node.clientHeight + 1 ||
                      node.scrollWidth > node.clientWidth + 1
                    )
                      issues.push(`truncated: ${node.textContent?.trim()}`)
                  }
                  if (row.top < list.top - 1 || row.bottom > list.bottom - 27)
                    issues.push("anchor under chrome or fade")
                  if (marker.top + marker.height / 2 < row.top || marker.top + marker.height / 2 > row.bottom)
                    issues.push("marker detached from anchor")
                  if (
                    rects.some(
                      (rect) =>
                        rect.left < frame.left + 1 ||
                        rect.right > frame.right - 1 ||
                        rect.top < frame.top + 1 ||
                        rect.bottom > frame.bottom - 27,
                    )
                  )
                    issues.push("marker outside frame or under fade")
                  if (!thin) return issues
                  if (!pop || popover?.dataset.open !== "true") return [...issues, "popover not positioned"]
                  if (
                    pop.left < frame.left + 7 ||
                    pop.right > frame.right - 7 ||
                    pop.top < frame.top + 7 ||
                    pop.bottom > frame.bottom - 7
                  )
                    issues.push("popover outside frame")
                  if (overlap(pop, marker)) issues.push("popover overlaps own marker")
                  if (overlap(pop, row)) issues.push("popover overlaps own anchor row")
                  if (width >= 380 && rects.some((rect, index) => index !== position && overlap(pop, rect)))
                    issues.push("popover overlaps other marker")
                  if (
                    width >= 380 &&
                    rects.some((rect, index) => rects.some((other, next) => next > index && overlap(rect, other)))
                  )
                    issues.push("markers overlap")
                  return issues
                },
                {
                  resolver,
                  entries: fleet(example),
                  target: example.features.at(position)!.anchor,
                  position,
                  thin,
                  width,
                },
              ),
            )
            .toEqual([])
          heights.push(await page.locator(".am-splash-hero").evaluate((node) => node.getBoundingClientRect().height))
        }
      }
      await resolver.dispose()
      expect(heights).toHaveLength(15)
      expect(Math.max(...heights) - Math.min(...heights)).toBe(0)
    })
  }
}

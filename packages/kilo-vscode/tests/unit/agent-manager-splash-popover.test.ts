import { describe, expect, it } from "bun:test"
import path from "node:path"
import { build } from "esbuild"
import { solidPlugin } from "esbuild-plugin-solid"
import { clearance, placement, type Rect } from "../../webview-ui/agent-manager/splash/placement"

const rect = (left: number, top: number, right: number, bottom: number): Rect => ({ left, top, right, bottom })
const frame = rect(20, 40, 380, 380)
const row = rect(20, 180, 380, 220)
const marker = rect(340, 190, 356, 206)

describe("splash popover placement", () => {
  it("measures at the marker-clear width, uses a 4px gap and prefers below on a tie", () => {
    const widths: number[] = []
    expect(
      placement({ frame, row, markers: [marker], selected: 0, measure: (width) => (widths.push(width), 60) }),
    ).toEqual({ left: 28, top: 224, width: 300, side: "below", maxHeight: undefined })
    expect(widths).toEqual([300])
  })

  it("keeps clear of the leftmost marker and accepts exactly the minimum width", () => {
    const markers = [marker, rect(204, 250, 220, 266)]
    expect(placement({ frame, row, markers, selected: 0, measure: () => 50 }).width).toBe(168)
  })

  it("falls back to the full inner width when the marker-clear column is below 168px", () => {
    const result = placement({
      frame: rect(20, 40, 280, 380),
      row,
      markers: [rect(190, 190, 206, 206)],
      selected: 0,
      measure: () => 60,
    })
    expect(result.left).toBe(28)
    expect(result.width).toBe(244)
  })

  it("chooses above when both sides fit but below would cover more other markers", () => {
    const result = placement({
      frame,
      row,
      markers: [rect(150, 190, 166, 206), rect(160, 240, 176, 256)],
      selected: 0,
      measure: () => 60,
    })
    expect(result.side).toBe("above")
    expect(result.top).toBe(116)
  })

  it("ignores nonoverlapping marker columns and prefers below on equal overlap", () => {
    const result = placement({
      frame,
      row,
      markers: [marker, rect(340, 240, 356, 256)],
      selected: 0,
      measure: () => 60,
    })
    expect(result.side).toBe("below")
  })

  it("treats touching marker edges as nonoverlapping", () => {
    const result = placement({
      frame,
      row,
      markers: [rect(150, 190, 166, 206), rect(160, 284, 176, 300)],
      selected: 0,
      measure: () => 60,
    })
    expect(result.side).toBe("below")
  })

  it("flips above when only above fits", () => {
    const result = placement({ frame, row: rect(20, 300, 380, 340), markers: [marker], selected: 0, measure: () => 80 })
    expect(result).toMatchObject({ side: "above", top: 216, maxHeight: undefined })
  })

  it("uses below when only below fits", () => {
    const result = placement({ frame, row: rect(20, 60, 380, 100), markers: [marker], selected: 0, measure: () => 80 })
    expect(result).toMatchObject({ side: "below", top: 104, maxHeight: undefined })
  })

  it("constrains internal height to the larger side when neither fits", () => {
    const below = placement({ frame, row, markers: [marker], selected: 0, measure: () => 400 })
    expect(below).toMatchObject({ side: "below", top: 224, maxHeight: 148 })
    const above = placement({ frame, row: rect(20, 240, 380, 280), markers: [marker], selected: 0, measure: () => 400 })
    expect(above).toMatchObject({ side: "above", top: 48, maxHeight: 188 })
  })

  it("constrains widths even without markers and in frames narrower than the nominal minimum", () => {
    expect(placement({ frame, row, markers: [], selected: 0, measure: () => 50 }).width).toBe(300)
    expect(placement({ frame: rect(0, 0, 100, 340), row, markers: [], selected: 0, measure: () => 50 }).width).toBe(84)
  })

  it("scrolls the whole row clear of the 28px fade, including the final padded row", () => {
    const viewport = rect(20, 80, 380, 360)
    expect(clearance(rect(20, 320, 380, 360), viewport)).toBe(28)
    expect(clearance(rect(20, 350, 380, 390), viewport)).toBe(58)
    expect(clearance(rect(20, 60, 380, 100), viewport)).toBe(-20)
    expect(clearance(rect(20, 292, 380, 332), viewport)).toBe(0)
    expect(clearance(rect(20, 80, 380, 120), viewport)).toBe(0)
  })

  it("mirrors the right inset, maximum width and marker-clear column in RTL", () => {
    const result = placement({
      frame,
      row,
      markers: [rect(44, 190, 60, 206)],
      selected: 0,
      rtl: true,
      measure: () => 60,
    })
    expect(result).toEqual({ left: 72, top: 224, width: 300, side: "below", maxHeight: undefined })
    expect(result.left + result.width).toBe(frame.right - 8)
  })

  it("keeps clear of every marker in RTL and accepts a column exactly 168px wide", () => {
    const markers = [rect(44, 190, 60, 206), rect(180, 240, 196, 256)]
    const result = placement({ frame, row, markers, selected: 0, rtl: true, measure: () => 60 })
    expect(result).toMatchObject({ left: 204, width: 168, side: "below" })
    for (const marker of markers) {
      expect(
        marker.left < result.left + result.width &&
          marker.right > result.left &&
          marker.top < result.top + 60 &&
          marker.bottom > result.top,
      ).toBe(false)
    }
    expect(result.top).toBeGreaterThanOrEqual(row.bottom + 4)
  })

  it("uses the full inner width in RTL below the marker-clear minimum", () => {
    const result = placement({
      frame: rect(20, 40, 280, 380),
      row,
      markers: [rect(94, 190, 110, 206)],
      selected: 0,
      rtl: true,
      measure: () => 60,
    })
    expect(result).toMatchObject({ left: 28, width: 244 })
  })

  it("mirrors LTR overlap minimization, side selection and internal height limits", () => {
    const mirror = (value: Rect) =>
      rect(frame.left + frame.right - value.right, value.top, frame.left + frame.right - value.left, value.bottom)
    for (const height of [60, 140, 400]) {
      for (const markers of [[], [marker], [rect(150, 190, 166, 206), rect(160, 240, 176, 256)]]) {
        const ltr = placement({ frame, row, markers, selected: 0, measure: () => height })
        const rtl = placement({
          frame,
          row: mirror(row),
          markers: markers.map(mirror),
          selected: 0,
          rtl: true,
          measure: () => height,
        })
        expect(rtl).toEqual({ ...ltr, left: frame.left + frame.right - ltr.left - ltr.width })
      }
    }
  })

  it("never returns negative height or width when the frame is too small for its insets", () => {
    for (const rtl of [false, true]) {
      const result = placement({
        frame: rect(0, 0, 12, 12),
        row: rect(0, 0, 12, 12),
        markers: [],
        selected: 0,
        rtl,
        measure: () => 60,
      })
      expect(result.maxHeight).toBe(0)
      expect(result.width).toBe(0)
      expect(Number.isFinite(result.top)).toBe(true)
    }
  })
})

it("renders a polite controlled region, wraps steps, retains marker focus and dismisses cleanly", async () => {
  const root = path.resolve(import.meta.dir, "../..")
  const solid = path.dirname(Bun.resolveSync("solid-js/package.json", root))
  const result = await build({
    stdin: {
      resolveDir: root,
      sourcefile: "splash-popover-fixture.tsx",
      loader: "tsx",
      contents: `
        import assert from "node:assert/strict"
        import { Window } from "happy-dom"
        const window = new Window({ url: "https://kilo.test" })
        Object.assign(globalThis, {
          window, document: window.document, navigator: window.navigator,
          HTMLElement: window.HTMLElement, Element: window.Element, Node: window.Node,
          MutationObserver: window.MutationObserver, ResizeObserver: window.ResizeObserver,
          getComputedStyle: window.getComputedStyle.bind(window),
          requestAnimationFrame: window.requestAnimationFrame.bind(window),
          cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
        })
        const { render } = await import("solid-js/web")
        const { createComponent, createSignal } = await import("solid-js")
        const { SplashPopover } = await import("./webview-ui/agent-manager/splash/Popover")
        const root = document.createElement("div")
        const marker = document.createElement("button")
        root.getBoundingClientRect = () => new window.DOMRect(20, 40, 300, 340)
        let row = {left:20,top:100,right:320,bottom:140}
        let pin = {left:260,top:100,right:276,bottom:116}
        document.body.append(marker, root)
        const [selected, select] = createSignal(0)
        const [open, show] = createSignal(true)
        let closes = 0
        const dispose = render(() => createComponent(SplashPopover, {
          id:"popover", features:[{name:"One",text:"First"},{name:"Two",text:"Second"},{name:"Three",text:"Third"}],
          get selected() { return selected() }, get open() { return open() },
          onSelect:select, onClose:() => { closes++; show(false) },
          anchor:() => row,
          markers:() => [pin],
          frame:() => root, rows:() => root, container:() => root,
          previousLabel:"Previous feature", nextLabel:"Next feature",
        }), root)
        await Promise.resolve()
        const pop = document.getElementById("popover")
        Object.defineProperty(pop, "offsetHeight", { value:70 })
        await new Promise(resolve => window.requestAnimationFrame(resolve))
        assert.equal(pop.dataset.open, "true")
        assert.equal(pop.style.left, "8px")
        assert.equal(pop.style.top, "104px")
        assert.equal(pop.style.width, "224px")
        root.style.direction = "rtl"
        pin = {left:64,top:100,right:80,bottom:116}
        root.dispatchEvent(new window.Event("scroll"))
        await new Promise(resolve => window.requestAnimationFrame(resolve))
        assert.equal(pop.style.left, "68px")
        assert.equal(pop.style.width, "224px")
        root.style.direction = "ltr"
        pin = {left:260,top:100,right:276,bottom:116}
        row = {left:20,top:280,right:320,bottom:320}
        root.dispatchEvent(new window.Event("scroll"))
        await new Promise(resolve => window.requestAnimationFrame(resolve))
        assert.equal(pop.dataset.side, "above")
        assert.equal(pop.style.top, "166px")
        assert.equal(pop.getAttribute("aria-live"), "polite")
        assert.equal(pop.getAttribute("aria-atomic"), "true")
        assert.equal(pop.getAttribute("role"), "region")
        const heading = document.getElementById(pop.getAttribute("aria-labelledby"))
        assert.equal(heading.tagName, "H3")
        assert.equal(heading.textContent, "One")
        assert.equal(pop.hidden, false)
        marker.focus()
        const prev = pop.querySelector('[aria-label="Previous feature"]')
        const next = pop.querySelector('[aria-label="Next feature"]')
        const down = new window.PointerEvent("pointerdown", { bubbles:true, cancelable:true })
        prev.dispatchEvent(down)
        assert.equal(down.defaultPrevented, true)
        const mouse = new window.MouseEvent("mousedown", { bubbles:true, cancelable:true })
        next.dispatchEvent(mouse)
        assert.equal(mouse.defaultPrevented, true)
        prev.click()
        assert.equal(selected(), 2)
        assert(pop.textContent.includes("Third"))
        assert.equal(document.getElementById(pop.getAttribute("aria-labelledby")).textContent, "Three")
        next.click()
        assert.equal(selected(), 0)
        assert.equal(document.activeElement, marker)
        marker.dispatchEvent(new window.PointerEvent("pointerdown", { bubbles:true, clientX:265, clientY:108 }))
        assert.equal(closes, 0)
        pop.dispatchEvent(new window.PointerEvent("pointerdown", { bubbles:true }))
        assert.equal(closes, 0)
        document.dispatchEvent(new window.KeyboardEvent("keydown", { key:"Escape", bubbles:true }))
        assert.equal(closes, 1)
        assert.equal(pop.hidden, true)
        show(true)
        document.body.dispatchEvent(new window.PointerEvent("pointerdown", { bubbles:true, clientX:500, clientY:500 }))
        assert.equal(closes, 2)
        show(true)
        dispose()
        document.dispatchEvent(new window.KeyboardEvent("keydown", { key:"Escape" }))
        assert.equal(closes, 2)
        await window.happyDOM.close()
      `,
    },
    bundle: true,
    conditions: ["browser"],
    external: ["happy-dom"],
    format: "esm",
    platform: "node",
    loader: { ".css": "empty" },
    logLevel: "silent",
    alias: {
      "solid-js": path.join(solid, "dist/solid.js"),
      "solid-js/web": path.join(solid, "web/dist/web.js"),
      "solid-js/store": path.join(solid, "store/dist/store.js"),
    },
    plugins: [solidPlugin()],
    target: "es2022",
    write: false,
  })
  const child = Bun.spawnSync([process.execPath, "run", "-"], {
    cwd: root,
    stdin: result.outputFiles.at(0)!.contents,
    stdout: "pipe",
    stderr: "pipe",
    windowsHide: true,
  })
  expect(child.exitCode, child.stdout.toString() + child.stderr.toString()).toBe(0)
})

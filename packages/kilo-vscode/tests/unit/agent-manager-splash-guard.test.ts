import { describe, expect, it } from "bun:test"
import { Window } from "happy-dom"
import { guard } from "../../webview-ui/agent-manager/splash/guard"

function setup() {
  const window = new Window()
  const root = window.document.createElement("div")
  root.innerHTML =
    '<button>Action</button><a href="/">Link</a><div tabindex="0"></div><div contenteditable="true"></div>'
  window.document.body.append(root)
  const dispose = guard(root)
  return { window, root, dispose }
}

describe("decorative sidebar interaction boundary", () => {
  it("leaves sibling marker buttons interactive and focusable outside the hidden guarded stack", () => {
    const { window, root, dispose } = setup()
    root.setAttribute("aria-hidden", "true")
    const card = window.document.createElement("div")
    window.document.body.append(card)
    card.append(root)
    const marker = window.document.createElement("button")
    marker.textContent = "1"
    card.append(marker)
    let calls = 0
    marker.addEventListener("click", () => calls++)
    marker.focus()
    marker.click()
    expect(window.document.activeElement).toBe(marker)
    expect(calls).toBe(1)
    expect(marker.closest('[aria-hidden="true"]')).toBe(null)
    expect([...card.querySelectorAll("button")].filter((el) => el.tabIndex >= 0)).toEqual([marker])
    dispose()
  })

  it("excludes existing and dynamically added controls from keyboard focus", async () => {
    const { window, root, dispose } = setup()
    expect([...root.children].every((el) => el.getAttribute("tabindex") === "-1")).toBe(true)
    const button = window.document.createElement("button")
    root.append(button)
    await window.happyDOM.waitUntilComplete()
    expect(button.tabIndex).toBe(-1)
    button.tabIndex = 0
    await window.happyDOM.waitUntilComplete()
    expect(button.tabIndex).toBe(-1)
    dispose()
  })

  it("blocks gesture origins and activation at both controls and document", () => {
    const { window, root, dispose } = setup()
    const button = root.querySelector("button")!
    const events = [
      "pointerdown",
      "mousedown",
      "click",
      "dblclick",
      "auxclick",
      "contextmenu",
      "dragstart",
      "keydown",
      "keyup",
      "touchstart",
    ]
    let calls = 0
    for (const event of events) {
      button.addEventListener(event, () => calls++)
      window.document.addEventListener(event, () => calls++)
      expect(button.dispatchEvent(new window.Event(event, { bubbles: true, cancelable: true }))).toBe(false)
    }
    expect(calls).toBe(0)
    dispose()
  })

  it("allows document resize listeners to receive movement and release after an outside origin", () => {
    const { window, root, dispose } = setup()
    const outside = window.document.createElement("div")
    window.document.body.append(outside)
    const events: string[] = []
    for (const event of ["mousedown", "mousemove", "mouseup"]) {
      window.document.addEventListener(event, () => events.push(event))
    }
    outside.dispatchEvent(new window.MouseEvent("mousedown", { bubbles: true }))
    const button = root.querySelector("button")!
    button.dispatchEvent(new window.MouseEvent("mousemove", { bubbles: true }))
    button.dispatchEvent(new window.MouseEvent("mouseup", { bubbles: true }))
    expect(events).toEqual(["mousedown", "mousemove", "mouseup"])
    dispose()
  })

  it("allows document DnD listeners to receive movement and release after an outside origin", () => {
    const { window, root, dispose } = setup()
    const outside = window.document.createElement("div")
    window.document.body.append(outside)
    const events: string[] = []
    for (const event of ["pointerdown", "pointermove", "pointerup"]) {
      window.document.addEventListener(event, () => events.push(event))
    }
    outside.dispatchEvent(new window.PointerEvent("pointerdown", { bubbles: true }))
    const button = root.querySelector("button")!
    button.dispatchEvent(new window.PointerEvent("pointermove", { bubbles: true }))
    button.dispatchEvent(new window.PointerEvent("pointerup", { bubbles: true }))
    expect(events).toEqual(["pointerdown", "pointermove", "pointerup"])
    dispose()
  })

  it("never cancels or swallows gesture continuation and hover tracking events", () => {
    const { window, root, dispose } = setup()
    const button = root.querySelector("button")!
    const events = [
      "pointermove",
      "mousemove",
      "pointerup",
      "mouseup",
      "pointercancel",
      "pointerover",
      "mouseover",
      "pointerout",
      "mouseout",
      "pointerleave",
      "mouseleave",
      "lostpointercapture",
      "drag",
      "dragover",
      "dragleave",
      "dragend",
      "drop",
    ]
    const controls: string[] = []
    const document: string[] = []
    for (const event of events) {
      button.addEventListener(event, () => controls.push(event))
      window.document.addEventListener(event, () => document.push(event))
      expect(button.dispatchEvent(new window.Event(event, { bubbles: true, cancelable: true }))).toBe(true)
    }
    expect(controls).toEqual(events)
    expect(document).toEqual(events)
    dispose()
  })

  it("stops event-driven hover portals without making the DOM inert", () => {
    const { window, root, dispose } = setup()
    const button = root.querySelector("button")!
    let calls = 0
    for (const event of ["pointerenter", "mouseenter"]) {
      button.addEventListener(event, () => calls++)
      button.dispatchEvent(new window.Event(event, { bubbles: false }))
    }
    expect(calls).toBe(0)
    expect(root.hasAttribute("inert")).toBe(false)
    dispose()
  })

  it("blurs programmatically focused controls before their focus handlers run", () => {
    const { window, root, dispose } = setup()
    const button = root.querySelector("button")!
    let calls = 0
    button.addEventListener("focus", () => calls++)
    button.addEventListener("focusin", () => calls++)
    button.focus()
    expect(window.document.activeElement).toBe(window.document.body)
    expect(calls).toBe(0)
    dispose()
  })

  it("disconnects listeners and observation on cleanup without affecting controls outside the preview", async () => {
    const { window, root, dispose } = setup()
    const outside = window.document.createElement("button")
    window.document.body.append(outside)
    outside.focus()
    expect(window.document.activeElement).toBe(outside)
    dispose()
    const button = window.document.createElement("button")
    root.append(button)
    await window.happyDOM.waitUntilComplete()
    expect(button.tabIndex).toBe(0)
    let calls = 0
    button.addEventListener("click", () => calls++)
    button.click()
    expect(calls).toBe(1)
  })
})

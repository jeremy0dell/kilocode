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

  it("prevents activation, dragging, keyboard and touch events from reaching controls", () => {
    const { window, root, dispose } = setup()
    const button = root.querySelector("button")!
    const events = [
      "pointerdown",
      "pointerup",
      "mousedown",
      "mouseup",
      "click",
      "dblclick",
      "auxclick",
      "contextmenu",
      "dragstart",
      "drop",
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

  it("stops event-driven hover portals without making the DOM inert", () => {
    const { window, root, dispose } = setup()
    const button = root.querySelector("button")!
    let calls = 0
    for (const event of ["pointerenter", "pointerover", "pointermove", "mouseenter", "mouseover", "mousemove"]) {
      button.addEventListener(event, () => calls++)
      button.dispatchEvent(new window.Event(event, { bubbles: true }))
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

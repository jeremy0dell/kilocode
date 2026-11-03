/** Preserve native CSS hover without exposing the decorative sidebar's controls or portals. */
export function guard(root: HTMLElement) {
  const view = root.ownerDocument.defaultView!
  const update = () => {
    for (const el of root.querySelectorAll<HTMLElement>(
      "a, area, button, input, select, textarea, summary, iframe, object, embed, audio[controls], video[controls], [tabindex], [contenteditable]",
    )) {
      if (el.getAttribute("tabindex") !== "-1") el.tabIndex = -1
    }
  }
  const block = (event: Event) => {
    event.preventDefault()
    event.stopImmediatePropagation()
    if (
      (event.type === "focus" || event.type === "focusin") &&
      (event.target instanceof view.HTMLElement || event.target instanceof view.SVGElement)
    ) {
      event.target.blur()
    }
  }
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
    "focus",
    "focusin",
    "pointerenter",
    "pointerover",
    "pointerleave",
    "pointerout",
    "pointermove",
    "mouseenter",
    "mouseover",
    "mouseleave",
    "mouseout",
    "mousemove",
  ]
  for (const event of events) root.addEventListener(event, block, { capture: true, passive: false })
  update()
  const observer = new view.MutationObserver(update)
  observer.observe(root, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["tabindex", "href", "contenteditable", "controls"],
  })
  return () => {
    observer.disconnect()
    for (const event of events) root.removeEventListener(event, block, true)
  }
}

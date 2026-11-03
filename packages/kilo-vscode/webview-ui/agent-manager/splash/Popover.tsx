import { createEffect, createSignal, onCleanup, Show } from "solid-js"
import { IconButton } from "@kilocode/kilo-ui/icon-button"
import { wrap } from "./selection"
import { clearance, placement, type Rect } from "./placement"

interface Props {
  id: string
  features: readonly { name: string; text: string }[]
  selected: number
  open: boolean
  onSelect: (index: number) => void
  onClose: () => void
  /** The full anchored row, not just its marker. Rects use viewport coordinates. */
  anchor: (index: number) => Rect | undefined
  /** Marker rects in feature order. */
  markers: () => readonly Rect[]
  frame: () => HTMLElement | undefined
  rows: () => HTMLElement | undefined
  /** Positioned sidebar block; the popover must be a sibling of the frame. */
  container: () => HTMLElement | undefined
  previousLabel: string
  nextLabel: string
}

export function SplashPopover(props: Props) {
  let pop: HTMLDivElement | undefined
  const [ready, setReady] = createSignal(false)
  const [side, setSide] = createSignal("below")
  const feature = () => props.features.at(props.selected)

  createEffect(() => {
    const frame = props.frame()
    const rows = props.rows()
    const container = props.container()
    const selected = props.selected
    const content = feature()
    setReady(false)
    if (!props.open || !content || !frame || !rows || !container || !pop) return
    const element = pop
    const document = element.ownerDocument
    const window = document.defaultView!
    let active = true
    let tick = 0
    const update = () => {
      const anchor = props.anchor(selected)
      if (!anchor) {
        setReady(false)
        return
      }
      rows.scrollTop += clearance(anchor, rows.getBoundingClientRect())
      const row = props.anchor(selected)
      if (!row) return
      const box = container.getBoundingClientRect()
      const result = placement({
        frame: frame.getBoundingClientRect(),
        row,
        markers: props.markers(),
        selected,
        rtl: window.getComputedStyle(container).direction === "rtl",
        measure: (width) => {
          element.style.width = `${width}px`
          element.style.maxHeight = "none"
          return element.offsetHeight
        },
      })
      element.style.left = `${result.left - box.left - container.clientLeft + container.scrollLeft}px`
      element.style.top = `${result.top - box.top - container.clientTop + container.scrollTop}px`
      element.style.maxHeight = result.maxHeight == null ? "none" : `${result.maxHeight}px`
      setSide(result.side)
      setReady(true)
    }
    const schedule = () => {
      window.cancelAnimationFrame(tick)
      tick = window.requestAnimationFrame(update)
    }
    const outside = (event: PointerEvent) => {
      if (event.composedPath().includes(element)) return
      // Marker clicks belong to the parent, which handles toggling the same marker.
      if (
        props
          .markers()
          .some(
            (rect) =>
              event.clientX >= rect.left &&
              event.clientX <= rect.right &&
              event.clientY >= rect.top &&
              event.clientY <= rect.bottom,
          )
      )
        return
      props.onClose()
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      event.preventDefault()
      props.onClose()
    }
    const observer = new ResizeObserver(schedule)
    observer.observe(container)
    observer.observe(frame)
    rows.addEventListener("scroll", schedule, { passive: true })
    document.addEventListener("pointerdown", outside, true)
    document.addEventListener("keydown", escape)
    document.fonts?.ready.then(() => {
      if (active) schedule()
    })
    document.fonts?.addEventListener("loadingdone", schedule)
    schedule()
    onCleanup(() => {
      active = false
      window.cancelAnimationFrame(tick)
      observer.disconnect()
      rows.removeEventListener("scroll", schedule)
      document.removeEventListener("pointerdown", outside, true)
      document.removeEventListener("keydown", escape)
      document.fonts?.removeEventListener("loadingdone", schedule)
    })
  })

  return (
    <div
      ref={pop}
      id={props.id}
      class="am-splash-popover"
      role="region"
      aria-labelledby={`${props.id}-heading`}
      hidden={!props.open || !feature()}
      data-open={ready() ? "true" : "false"}
      data-side={side()}
      aria-live="polite"
      aria-atomic="true"
      style={{
        position: "absolute",
        "box-sizing": "border-box",
        "overflow-y": "auto",
        "overflow-wrap": "anywhere",
        visibility: ready() ? "visible" : "hidden",
      }}
    >
      <Show when={feature()}>
        {(value) => (
          <>
            <div class="am-splash-popover__head">
              <span class="am-splash-popover__number" aria-hidden="true">
                {props.selected + 1}
              </span>
              <h3 id={`${props.id}-heading`} class="am-splash-popover__name" style={{ margin: "0" }}>
                {value().name}
              </h3>
              <span class="am-splash-popover__steps">
                <IconButton
                  icon="chevron-left"
                  size="small"
                  variant="ghost"
                  aria-label={props.previousLabel}
                  onPointerDown={(event) => event.preventDefault()}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => props.onSelect(wrap(props.selected, -1, props.features.length))}
                />
                <span>
                  {props.selected + 1}/{props.features.length}
                </span>
                <IconButton
                  icon="chevron-right"
                  size="small"
                  variant="ghost"
                  aria-label={props.nextLabel}
                  onPointerDown={(event) => event.preventDefault()}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => props.onSelect(wrap(props.selected, 1, props.features.length))}
                />
              </span>
            </div>
            <p class="am-splash-popover__text">{value().text}</p>
          </>
        )}
      </Show>
    </div>
  )
}

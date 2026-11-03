export type Rect = Pick<DOMRect, "top" | "bottom" | "left" | "right">

export function clearance(row: Rect, viewport: Rect) {
  if (row.bottom > viewport.bottom - 28) return row.bottom - (viewport.bottom - 28)
  if (row.top < viewport.top) return row.top - viewport.top
  return 0
}

export function placement(opts: {
  frame: Rect
  row: Rect
  markers: readonly Rect[]
  selected: number
  rtl?: boolean
  measure: (width: number) => number
}) {
  const inset = opts.rtl ? opts.frame.right - 8 : opts.frame.left + 8
  const limit = opts.rtl
    ? Math.max(...opts.markers.map((rect) => rect.right)) + 8
    : Math.min(...opts.markers.map((rect) => rect.left)) - 8
  const column = opts.rtl ? inset - limit : limit - inset
  const inner = opts.frame.right - opts.frame.left - 16
  const width = Math.max(0, Math.min(column < 168 ? inner : Math.min(column, inner), 300))
  const left = opts.rtl ? inset - width : inset
  const height = opts.measure(width)
  const below = Math.max(0, opts.frame.bottom - 8 - (opts.row.bottom + 4))
  const above = Math.max(0, opts.row.top - 4 - (opts.frame.top + 8))
  const covers = (top: number) =>
    opts.markers.filter(
      (rect, index) =>
        index !== opts.selected &&
        rect.left < left + width &&
        rect.right > left &&
        rect.top < top + height &&
        rect.bottom > top,
    ).length
  const side =
    height <= below && height <= above
      ? covers(opts.row.top - 4 - height) < covers(opts.row.bottom + 4)
        ? "above"
        : "below"
      : height <= below
        ? "below"
        : height <= above
          ? "above"
          : below >= above
            ? "below"
            : "above"
  const space = side === "below" ? below : above
  const top = side === "below" ? opts.row.bottom + 4 : opts.row.top - 4 - Math.min(height, space)
  return { left, top, width, side, maxHeight: height > space ? space : undefined }
}

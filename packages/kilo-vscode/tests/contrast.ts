/** Resolve CSS Color 4 through the browser canvas before applying WCAG relative luminance. */
export function contrast(nodes: Element[]) {
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
  return nodes.map((node) => {
    const style = getComputedStyle(node)
    const background = luminance(style.backgroundColor)
    const foreground = luminance(style.color)
    return (Math.max(background, foreground) + 0.05) / (Math.min(background, foreground) + 0.05)
  })
}

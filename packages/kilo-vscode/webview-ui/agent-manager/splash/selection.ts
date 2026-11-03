export function wrap(index: number, delta: number, count: number): number {
  if (count === 0) return 0
  return (index + delta + count) % count
}

export function visible(index: number, count: number, size: number): number[] {
  const shown = Math.min(size, count)
  const start = Math.max(0, Math.min(index - 1, count - shown))
  return Array.from({ length: shown }, (_, offset) => start + offset)
}

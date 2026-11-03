export function wrap(index: number, delta: number, count: number): number {
  if (count === 0) return 0
  return (index + delta + count) % count
}

export function start(index: number, count: number): number {
  return Math.max(0, Math.min(index - 1, count - 3))
}

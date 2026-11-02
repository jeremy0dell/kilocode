export function splashView(enabled: boolean, folded: boolean) {
  if (!enabled) return "off"
  return folded ? "folded" : "expanded"
}

export function folded(state: { get<T>(key: string): T | undefined }): boolean | undefined {
  const saved = state.get<unknown>("kilo.agentManager.splashFolded")
  if (typeof saved === "boolean") return saved
  return state.get<unknown>("kilo.agentManager.introDismissed") === true ? true : undefined
}

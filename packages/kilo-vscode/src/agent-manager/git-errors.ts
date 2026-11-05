/** Reported when Git cannot be spawned because the binary is missing from PATH. */
export const MISSING_GIT =
  "Git is not installed or not found in PATH. Please install Git (https://git-scm.com) and restart VS Code."

/** Reported when worktree creation runs without a git repository in the open folder. */
export const NO_GIT_REPO = "Open a folder that contains a git repository to use worktrees"

/** True when Apple's `/usr/bin/git` shim reports that the Command Line Tools are not installed. */
export function missingDeveloperTools(text: string): boolean {
  return /xcrun: error: invalid active developer path|xcode-select: note: no developer tools were found/i.test(text)
}

/** The child's trimmed stderr, when the error carries one. */
export function stderrText(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined
  const data = error as { stderr?: unknown }
  return typeof data.stderr === "string" && data.stderr.trim() ? data.stderr.trim() : undefined
}

/** Raw error text for Show details, preferring the child's stderr. */
export function errorText(error: unknown): string {
  const stderr = stderrText(error)
  if (stderr) return stderr
  if (error && typeof error === "object") {
    const data = error as { message?: unknown }
    if (typeof data.message === "string" && data.message.trim()) return data.message.trim()
  }
  return String(error)
}

/** Whether a probe failure confirms the tool is absent rather than failing for another reason. */
export function toolAbsent(error: unknown, detail: string): boolean {
  if (error && typeof error === "object" && (error as NodeJS.ErrnoException).code === "ENOENT") return true
  return missingDeveloperTools(detail)
}

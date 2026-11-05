/** Setup-script task budget. */
export const SETUP_TIMEOUT_MS = 5 * 60_000

/** One install task budget. */
export const INSTALL_TIMEOUT_MS = 30 * 60_000

/** Readiness check budget. */
export const READINESS_DEADLINE_MS = 3_000

/** Fix budget for a folder picker or a short Git fix. */
export const FIX_DEADLINE_MS = 10 * 60_000

/** An LFS install chains two install tasks; the webview waits out both plus a margin. */
export const INSTALL_DEADLINE_MS = INSTALL_TIMEOUT_MS * 2 + SETUP_TIMEOUT_MS

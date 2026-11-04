import { it } from "bun:test"
import { fixture } from "../fixtures/run"

it(
  "restores the full New Worktree draft after a remount",
  () => fixture("new-worktree-draft", { DRAFT_CASE: "roundtrip" }),
  60_000,
)

it(
  "follows the active project when the draft never changed the project",
  () => fixture("new-worktree-draft", { DRAFT_CASE: "sticky" }),
  60_000,
)

it(
  "does not substitute a missing saved project and does not resurrect a submitted draft",
  () => fixture("new-worktree-draft", { DRAFT_CASE: "missing" }),
  60_000,
)

it(
  "keeps an explicit project-row click over a saved draft project",
  () => fixture("new-worktree-draft", { DRAFT_CASE: "explicit" }),
  60_000,
)

it(
  "keeps restored draft choices while the model catalog arrives",
  () => fixture("new-worktree-draft", { DRAFT_CASE: "catalog" }),
  60_000,
)

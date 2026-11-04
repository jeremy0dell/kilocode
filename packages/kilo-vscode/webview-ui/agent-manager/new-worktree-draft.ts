// Draft persistence for the New Worktree dialog. The draft lives in webview
// state, which the Agent Manager serializer keeps across a Reload window.

import type { ModelAllocations } from "./multi-model-utils"
import { MAX_MULTI_VERSIONS, allocationKey } from "./multi-model-utils"

export type DraftVersions = 1 | 2 | 3 | 4

export interface DraftAllocation {
  providerID: string
  modelID: string
  name: string
  count: number
  variant?: string
}

export interface WorktreeDraft {
  project?: string
  name?: string
  branch?: string
  versions?: DraftVersions
  compare?: boolean
  allocations?: DraftAllocation[]
  goal?: boolean
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined
}

function version(value: unknown): DraftVersions | undefined {
  return value === 1 || value === 2 || value === 3 || value === 4 ? value : undefined
}

function entry(data: DraftAllocation): DraftAllocation {
  const next: DraftAllocation = {
    providerID: data.providerID,
    modelID: data.modelID,
    name: data.name,
    count: data.count,
  }
  if (data.variant) next.variant = data.variant
  return next
}

function allocation(value: unknown): DraftAllocation | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined
  const data = value as Record<string, unknown>
  if (typeof data.providerID !== "string" || typeof data.modelID !== "string" || typeof data.name !== "string")
    return undefined
  if (
    typeof data.count !== "number" ||
    !Number.isInteger(data.count) ||
    data.count < 1 ||
    data.count > MAX_MULTI_VERSIONS
  )
    return undefined
  return entry({
    providerID: data.providerID,
    modelID: data.modelID,
    name: data.name,
    count: data.count,
    variant: text(data.variant),
  })
}

/** Read a persisted draft, dropping anything malformed. */
function readDraft(value: unknown): WorktreeDraft {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  const data = value as Record<string, unknown>
  const list = Array.isArray(data.allocations)
    ? data.allocations.map(allocation).filter((item): item is DraftAllocation => item !== undefined)
    : []
  return {
    project: text(data.project),
    name: text(data.name),
    branch: text(data.branch),
    versions: version(data.versions),
    compare: data.compare === true ? true : undefined,
    allocations: list.length > 0 ? list : undefined,
    goal: data.goal === true ? true : undefined,
  }
}

/** Initial signal values for a restored draft. */
export function draftValues(draft: WorktreeDraft) {
  return {
    name: draft.name ?? "",
    branch: draft.branch ?? "",
    versions: draft.versions ?? 1,
    compare: draft.compare === true,
    goal: draft.goal === true,
    allocations: readAllocations(draft.allocations),
  }
}

/** Keep a saved project only while it still exists; otherwise use today's default. */
export function restoreProject(
  draft: WorktreeDraft,
  list: Array<{ id: string }>,
  fallback: string | undefined,
): string | undefined {
  if (draft.project && list.some((item) => item.id === draft.project)) return draft.project
  return fallback
}

/** Read the draft from cached webview state. */
export function readCached(state: Record<string, unknown> | undefined): WorktreeDraft {
  return readDraft(state?.advancedDialogDraft)
}

/** Persist only meaningful values so an untouched draft stays empty. */
export function writeDraft(draft: WorktreeDraft): WorktreeDraft | undefined {
  const next: WorktreeDraft = {}
  if (draft.project) next.project = draft.project
  if (draft.name) next.name = draft.name
  if (draft.branch) next.branch = draft.branch
  if (draft.versions && draft.versions > 1) next.versions = draft.versions
  if (draft.compare) next.compare = true
  if (draft.allocations && draft.allocations.length > 0) next.allocations = draft.allocations
  if (draft.goal) next.goal = true
  return Object.keys(next).length > 0 ? next : undefined
}

/** Rebuild the allocation Map from persisted entries, keeping display names. */
function readAllocations(list: DraftAllocation[] | undefined): ModelAllocations {
  const map: ModelAllocations = new Map()
  if (!list) return map
  for (const item of list) map.set(allocationKey(item.providerID, item.modelID), entry(item))
  return map
}

export function writeAllocations(map: ModelAllocations): DraftAllocation[] | undefined {
  if (map.size === 0) return undefined
  return [...map.values()].map(entry)
}

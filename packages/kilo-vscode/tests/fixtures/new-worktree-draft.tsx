import assert from "node:assert/strict"
import { Window } from "happy-dom"
import type { Readiness, WebviewMessage } from "../../webview-ui/src/types/messages"

const window = new Window({ url: "http://localhost" })
Object.defineProperty(window, "origin", { value: window.location.origin })
const sent: WebviewMessage[] = []
const model = { providerID: "kilo", modelID: "m1" }
const image = { id: "img", filename: "shot.png", mime: "image/png", dataUrl: "data:image/png;base64,AAAA" }
const scenario = process.env.DRAFT_CASE ?? "roundtrip"
const state: Record<string, unknown> = {}
if (scenario === "roundtrip") {
  state.advancedDialogImages = [image]
  state.advancedDialogSelections = { model }
}
if (scenario === "missing") {
  state.advancedDialogDraft = { project: "gone", name: "carried" }
  state.advancedDialogSelections = { model }
}
if (scenario === "explicit") {
  state.advancedDialogDraft = { project: "p2" }
  state.advancedDialogSelections = { model }
}
if (scenario === "catalog") {
  state.advancedDialogSelections = { model }
  state.advancedDialogDraft = {
    compare: true,
    versions: 3,
    allocations: [
      { providerID: "kilo", modelID: "m1", name: "Gateway Alpha", count: 2 },
      { providerID: "kilo", modelID: "m2", name: "Gateway Beta", count: 1 },
    ],
  }
}
const api = {
  postMessage: (message: WebviewMessage) => sent.push(structuredClone(message)),
  getState: () => state,
  setState: (next: Record<string, unknown>) => {
    for (const key of Object.keys(state)) delete state[key]
    Object.assign(state, structuredClone(next))
  },
}

Object.assign(globalThis, {
  window,
  document: window.document,
  navigator: window.navigator,
  localStorage: window.localStorage,
  Node: window.Node,
  NodeFilter: window.NodeFilter,
  Element: window.Element,
  HTMLElement: window.HTMLElement,
  HTMLHeadElement: window.HTMLHeadElement,
  HTMLButtonElement: window.HTMLButtonElement,
  HTMLInputElement: window.HTMLInputElement,
  HTMLSelectElement: window.HTMLSelectElement,
  HTMLTextAreaElement: window.HTMLTextAreaElement,
  SVGElement: window.SVGElement,
  MutationObserver: window.MutationObserver,
  IntersectionObserver: window.IntersectionObserver,
  ResizeObserver: window.ResizeObserver,
  CustomEvent: window.CustomEvent,
  customElements: window.customElements,
  Event: window.Event,
  KeyboardEvent: window.KeyboardEvent,
  MouseEvent: window.MouseEvent,
  MessageEvent: window.MessageEvent,
  requestAnimationFrame: window.requestAnimationFrame.bind(window),
  cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
  getComputedStyle: window.getComputedStyle.bind(window),
  acquireVsCodeApi: () => api,
})

const { render } = await import("solid-js/web")
const { Show, createSignal, onCleanup, onMount } = await import("solid-js")
const { DialogProvider, useDialog } = await import("@kilocode/kilo-ui/context/dialog")
const { VSCodeProvider } = await import("../../webview-ui/src/context/vscode")
const { ServerProvider } = await import("../../webview-ui/src/context/server")
const { ConfigContext } = await import("../../webview-ui/src/context/config")
const { LanguageContext } = await import("../../webview-ui/src/context/language")
const { NotificationsProvider } = await import("../../webview-ui/src/context/notifications")
const { ProviderProvider } = await import("../../webview-ui/src/context/provider")
const { SessionProvider } = await import("../../webview-ui/src/context/session")
const { SpeechToTextModelsProvider } = await import("../../webview-ui/src/context/speech-to-text-models")
const { NewWorktreeDialog } = await import("../../webview-ui/agent-manager/NewWorktreeDialog")
const { createModeRouter } = await import("../../webview-ui/agent-manager/mode-router")
const { post } = await import("../../webview-ui/src/utils/webview-message")

const config = {
  config: () => ({}),
  globalConfig: () => ({}),
  globalDraft: () => ({}),
  projectConfig: () => ({}),
  collections: () => ({}),
  settings: () => ({}),
  shortcuts: () => ({ bindings: {}, selection: false }),
  features: () => ({ indexing: false, sandboxControls: false, backgroundSubagents: false, speechToText: false }),
  loading: () => false,
  isDirty: () => false,
  saving: () => false,
  saveError: () => null,
  updateConfig: () => {},
  updateGlobalConfig: () => {},
  updateProjectConfig: () => {},
  updateSetting: () => {},
  applySetting: () => {},
  saveConfig: () => {},
  discardConfig: () => {},
}
const language = { locale: () => "en", setLocale: () => {}, userOverride: () => "", t: (key: string) => key }
const [active, setActive] = createSignal("p1")
const [row, setRow] = createSignal<string | undefined>(undefined)
const project = (id: string) => ({
  id,
  root: `/${id}`,
  label: id,
  pinned: id === "p1",
  active: id === active(),
  expanded: true,
  initialized: true,
  missing: false,
})
const projects = () => [project("p1"), project("p2"), project("p3")]
const closes = { value: 0 }
const [open, setOpen] = createSignal(false)
const Opener = () => {
  const dialog = useDialog()
  const [closing, setClosing] = createSignal(false)
  onCleanup(() => dialog.close())
  onMount(() =>
    dialog.show(
      () => (
        <NewWorktreeDialog
          closing={closing}
          mode={createModeRouter()}
          projectId={row() ?? active()}
          activeProjectId={active()}
          projects={projects}
          onClose={() => {
            closes.value++
            dialog.close()
          }}
        />
      ),
      () => setClosing(true),
    ),
  )
  return null
}

const host = document.createElement("div")
document.body.append(host)
const dispose = render(
  () => (
    <VSCodeProvider>
      <ServerProvider>
        <ProviderProvider>
          <ConfigContext.Provider value={config as never}>
            <LanguageContext.Provider value={language as never}>
              <NotificationsProvider>
                <SessionProvider>
                  <SpeechToTextModelsProvider>
                    <DialogProvider>
                      <Show when={open()}>
                        <Opener />
                      </Show>
                    </DialogProvider>
                  </SpeechToTextModelsProvider>
                </SessionProvider>
              </NotificationsProvider>
            </LanguageContext.Provider>
          </ConfigContext.Provider>
        </ProviderProvider>
      </ServerProvider>
    </VSCodeProvider>
  ),
  host,
)

const settle = async () => {
  await Promise.resolve()
  await window.happyDOM.waitUntilComplete()
}
const emit = async (data: { type: string; [key: string]: unknown }) => {
  post(structuredClone(data))
  await settle()
}
const loadAgents = () => emit({ type: "agentsLoaded", agents: [{ name: "code" }], defaultAgent: "code" })
const loadModels = () =>
  emit({
    type: "providersLoaded",
    organizationId: null,
    ready: true,
    providers: {
      kilo: {
        id: "kilo",
        name: "Kilo",
        models: {
          m1: { id: "m1", name: "Gateway Alpha" },
          m2: { id: "m2", name: "Gateway Beta" },
        },
      },
    },
    connected: ["kilo"],
    defaults: { kilo: "m1" },
    defaultSelection: model,
    authMethods: {},
    authStates: {},
  })

const checks = () =>
  sent.filter(
    (item): item is Extract<WebviewMessage, { type: "agentManager.checkReadiness" }> =>
      item.type === "agentManager.checkReadiness",
  )
const creates = () => sent.filter((item) => item.type === "agentManager.createMultiVersion")
const submit = () => {
  const button = document.querySelector<HTMLButtonElement>(".am-nv-submit")
  assert.ok(button, "missing Create button")
  return button
}
const prompt = () => {
  const area = document.querySelector<HTMLTextAreaElement>(".am-prompt-input")
  assert.ok(area, "missing prompt")
  return area
}
const reply = (projectId: string, requestID: string, result: Readiness) =>
  emit({ type: "agentManager.readiness", projectId, requestID, result })
const fill = (selector: string, value: string) => {
  const input = document.querySelector<HTMLInputElement>(selector)
  assert.ok(input, `missing ${selector}`)
  input.value = value
  input.dispatchEvent(new window.Event("input", { bubbles: true }) as never)
}
const pickProject = async (id: string) => {
  document.querySelector<HTMLButtonElement>(".am-nv-origin-project")!.click()
  await settle()
  const option = Array.from(document.querySelectorAll<HTMLButtonElement>(".am-project-option")).find((item) =>
    item.textContent?.includes(id),
  )
  assert.ok(option, `missing project ${id}`)
  option.click()
  await settle()
}
const pickVersions = async (count: number) => {
  const pill = Array.from(document.querySelectorAll<HTMLButtonElement>(".am-nv-pill")).find(
    (item) => item.textContent?.trim() === String(count),
  )
  assert.ok(pill, `missing ${count} pill`)
  pill.click()
  await settle()
}
const compare = () => {
  const section = document.querySelector<HTMLElement>(".am-nv-compare-section")
  assert.ok(section, "missing compare section")
  return section
}
const openCompare = async () => {
  compare().querySelector<HTMLButtonElement>(".am-selector-trigger")!.click()
  await settle()
}
const allocation = (name: string) => {
  const row = Array.from(document.querySelectorAll<HTMLElement>(".am-mm-item")).find((item) =>
    item.textContent?.includes(name),
  )
  assert.ok(row, `missing allocation ${name}`)
  return row
}
const allocate = async (name: string, count?: number) => {
  const row = allocation(name)
  const box = row.querySelector<HTMLInputElement>(".am-mm-checkbox")
  assert.ok(box, `missing checkbox ${name}`)
  box.checked = true
  box.dispatchEvent(new window.Event("change", { bubbles: true }) as never)
  await settle()
  if (count == null) return
  const select = allocation(name).querySelector<HTMLSelectElement>(
    "select.am-mm-count-select:not(.am-mm-variant-select)",
  )
  assert.ok(select, `missing count ${name}`)
  select.value = String(count)
  select.dispatchEvent(new window.Event("change", { bubbles: true }) as never)
  await settle()
}
// The dialog stack disposes a closed dialog after its 100 ms exit transition.
const close = async () => {
  setOpen(false)
  await new Promise((done) => setTimeout(done, 150))
  await settle()
}
const mount = async () => {
  if (open()) await close()
  await new Promise((done) => setTimeout(done, 150))
  sent.length = 0
  closes.value = 0
  setOpen(true)
  await settle()
  // Mounting checks the selected project once.
  assert.equal(checks().length, 1)
  const check = checks().at(0)
  assert.ok(check, "missing mount readiness check")
  return check.requestID
}

if (scenario === "roundtrip") {
  await loadAgents()
  await loadModels()
  const id = await mount()
  assert.equal(checks().at(0)?.projectId, "p1")
  await reply("p1", id, { status: "ready" })

  // Enter goal composition without dispatching.
  fill(".am-prompt-input", "/goal")
  submit().click()
  await settle()
  assert.equal(creates().length, 0)
  assert.ok(document.querySelector(".prompt-goal-header"), "goal mode must be on")
  fill(".am-prompt-input", "ship the release")

  await pickProject("p2")
  fill(".am-nv-name-input", "draft name")
  fill(".am-nv-branch-input", "feat/draft")
  await pickVersions(3)
  document.querySelector<HTMLButtonElement>(".am-nv-pill-compare")!.click()
  await settle()
  await openCompare()
  await allocate("Gateway Alpha", 2)
  await allocate("Gateway Beta", 1)
  await openCompare()
  assert.deepEqual(state.advancedDialogDraft, {
    project: "p2",
    name: "draft name",
    branch: "feat/draft",
    versions: 3,
    compare: true,
    allocations: [
      { providerID: "kilo", modelID: "m1", name: "Gateway Alpha", count: 2 },
      { providerID: "kilo", modelID: "m2", name: "Gateway Beta", count: 1 },
    ],
    goal: true,
  })
  await close()

  const next = await mount()
  assert.equal(checks().at(0)?.projectId, "p2", "restoring a project must run its readiness check")
  await reply("p2", next, { status: "ready" })
  assert.equal(document.querySelector<HTMLElement>(".am-nv-origin-project")?.textContent?.trim(), "p2")
  assert.equal(document.querySelector<HTMLInputElement>(".am-nv-name-input")?.value, "draft name")
  assert.equal(document.querySelector<HTMLInputElement>(".am-nv-branch-input")?.value, "feat/draft")
  assert.ok(document.querySelector(".prompt-goal-header"), "goal mode must be restored")
  assert.equal(prompt().value, "ship the release")
  assert.equal(document.querySelectorAll(".image-attachment").length, 1, "image must be restored")
  const value = compare().querySelector<HTMLElement>(".am-selector-value")
  assert.ok(value?.textContent?.includes("Gateway Alpha"))
  assert.ok(value?.textContent?.includes("Gateway Beta"))
  await openCompare()
  const checked = Array.from(document.querySelectorAll<HTMLElement>(".am-mm-item-checked")).map(
    (row) => row.querySelector(".am-mm-item-name")?.textContent,
  )
  assert.deepEqual(checked, ["Gateway Alpha", "Gateway Beta"])
  assert.deepEqual((state.advancedDialogDraft as { allocations?: unknown }).allocations, [
    { providerID: "kilo", modelID: "m1", name: "Gateway Alpha", count: 2 },
    { providerID: "kilo", modelID: "m2", name: "Gateway Beta", count: 1 },
  ])
  await openCompare()
  // Versions are hidden while comparing; leaving compare shows the restored count.
  document.querySelector<HTMLButtonElement>(".am-nv-pill-back")!.click()
  await settle()
  assert.equal(document.querySelector(".am-nv-pill-active")?.textContent?.trim(), "3")
  await close()
}

if (scenario === "missing") {
  await loadAgents()
  await loadModels()
  const id = await mount()
  assert.equal(checks().at(0)?.projectId, "p1", "a missing saved project must not be checked")
  assert.equal(document.querySelector<HTMLElement>(".am-nv-origin-project")?.textContent?.trim(), "p1")
  assert.equal(document.querySelector<HTMLInputElement>(".am-nv-name-input")?.value, "carried")

  // A blocked submit keeps the draft.
  const blocked: Readiness = {
    status: "blocked",
    code: "not_git_repo",
    name: "scratch",
    trusted: true,
    identity: true,
  }
  await reply("p1", id, blocked)
  submit().click()
  await settle()
  assert.equal(creates().length, 0)
  assert.equal((state.advancedDialogDraft as { name?: string }).name, "carried")
  assert.equal(
    (state.advancedDialogDraft as { project?: string }).project,
    undefined,
    "the default project must not be persisted",
  )

  const again = Array.from(document.querySelectorAll<HTMLButtonElement>(".am-readiness button")).find(
    (item) => item.textContent === "agentManager.readiness.check",
  )
  assert.ok(again)
  again.click()
  await settle()
  await reply("p1", checks().at(-1)!.requestID, { status: "ready" })

  fill(".am-nv-branch-input", "feat/submitted")
  fill(".am-prompt-input", "do not resurrect me")
  await pickVersions(2)
  submit().click()
  await settle()
  assert.equal(creates().length, 1)
  assert.equal(state.advancedDialogDraft, undefined, "a dispatch must clear the persisted draft")

  // A late edit during the close transition must not write the draft back.
  const late = document.querySelector<HTMLInputElement>(".am-nv-name-input")
  assert.ok(late, "dialog content must remain mounted during the exit transition")
  late.value = "resurrected"
  late.dispatchEvent(new window.Event("input", { bubbles: true }) as never)
  await settle()
  assert.equal(state.advancedDialogDraft, undefined, "a submitted draft must not be resurrected")
  await close()

  await mount()
  assert.equal(document.querySelector<HTMLElement>(".am-nv-origin-project")?.textContent?.trim(), "p1")
  assert.equal(document.querySelector<HTMLInputElement>(".am-nv-name-input")?.value, "")
  assert.equal(document.querySelector<HTMLInputElement>(".am-nv-branch-input")?.value, "")
  assert.equal(prompt().value, "")
  assert.equal(document.querySelector(".am-nv-pill-active")?.textContent?.trim(), "1")
  assert.equal(document.querySelector(".am-nv-compare-section"), null)
  assert.equal(document.querySelector(".prompt-goal-header"), null)
  assert.equal(document.querySelectorAll(".image-attachment").length, 0)
  const draft = state.advancedDialogDraft as Record<string, unknown> | undefined
  for (const key of ["name", "branch", "versions", "compare", "allocations", "goal"]) {
    assert.equal(draft?.[key], undefined, `submitted draft key ${key} must not come back`)
  }
  await close()
}

if (scenario === "sticky") {
  await loadAgents()
  await loadModels()
  const first = await mount()
  assert.equal(checks().at(0)?.projectId, "p1")
  assert.equal(document.querySelector<HTMLElement>(".am-nv-origin-project")?.textContent?.trim(), "p1")
  await reply("p1", first, { status: "ready" })
  await close()

  // An untouched draft must not pin the dialog to the project it was opened on.
  setActive("p2")
  const second = await mount()
  assert.equal(checks().at(0)?.projectId, "p2")
  assert.equal(document.querySelector<HTMLElement>(".am-nv-origin-project")?.textContent?.trim(), "p2")
  await reply("p2", second, { status: "ready" })
  await close()
}

if (scenario === "explicit") {
  await loadAgents()
  await loadModels()
  // A "+" click on a non-active project row must beat the saved draft project.
  setRow("p3")
  const id = await mount()
  assert.equal(checks().at(0)?.projectId, "p3")
  assert.equal(document.querySelector<HTMLElement>(".am-nv-origin-project")?.textContent?.trim(), "p3")
  await reply("p3", id, { status: "ready" })
  await close()
}

if (scenario === "catalog") {
  await loadAgents()
  const id = await mount()
  assert.equal(checks().at(0)?.projectId, "p1")
  // The catalog has not arrived yet: the restored compare allocation still shows its saved names.
  assert.ok(compare())
  const before = compare().querySelector<HTMLElement>(".am-selector-value")?.textContent ?? ""
  assert.ok(before.includes("Gateway Alpha"))
  assert.ok(before.includes("Gateway Beta"))
  assert.equal(submit().disabled, true, "creation waits for the catalog")
  await reply("p1", id, { status: "ready" })

  await loadModels()
  const after = compare().querySelector<HTMLElement>(".am-selector-value")?.textContent ?? ""
  assert.ok(after.includes("Gateway Alpha"), "the empty catalog must not reset the restored allocation")
  assert.ok(after.includes("Gateway Beta"))
  assert.equal(submit().disabled, false)
  await openCompare()
  const checked = Array.from(document.querySelectorAll<HTMLElement>(".am-mm-item-checked")).map(
    (row) => row.querySelector(".am-mm-item-name")?.textContent,
  )
  assert.deepEqual(checked, ["Gateway Alpha", "Gateway Beta"])
  assert.deepEqual((state.advancedDialogDraft as { allocations?: unknown }).allocations, [
    { providerID: "kilo", modelID: "m1", name: "Gateway Alpha", count: 2 },
    { providerID: "kilo", modelID: "m2", name: "Gateway Beta", count: 1 },
  ])
  await openCompare()

  // The saved single-model choice also survives the empty catalog.
  document.querySelector<HTMLButtonElement>(".am-nv-pill-back")!.click()
  await settle()
  assert.ok(
    document.querySelector(".prompt-input-hint .model-selector-trigger-label")?.textContent?.includes("Gateway Alpha"),
  )
  await close()
}

dispose()
await window.happyDOM.abort()
window.close()

import assert from "node:assert/strict"
import { Window } from "happy-dom"
import type { Readiness, WebviewMessage } from "../../webview-ui/src/types/messages"

const window = new Window({ url: "http://localhost" })
Object.defineProperty(window, "origin", { value: window.location.origin })
const sent: WebviewMessage[] = []
// A valid saved model is required, or Create stays disabled regardless of readiness.
const saved = {
  advancedDialogSelections: { model: { providerID: "kilo", modelID: "m1" } },
  advancedDialogImages: [{ id: "img", filename: "shot.png", mime: "image/png", dataUrl: "data:image/png;base64,AAAA" }],
}
const api = {
  postMessage: (message: WebviewMessage) => sent.push(structuredClone(message)),
  getState: () => saved,
  setState: () => {},
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
const project = (id: string) => ({
  id,
  root: `/${id}`,
  label: id,
  pinned: id === "p1",
  active: id === "p1",
  expanded: true,
  initialized: true,
  missing: false,
})
const projects = () => [project("p1"), project("p2")]
const closes = { value: 0 }
const [open, setOpen] = createSignal(false)
const Opener = () => {
  const dialog = useDialog()
  onCleanup(() => dialog.close())
  onMount(() =>
    dialog.show(() => (
      <NewWorktreeDialog
        mode={createModeRouter()}
        projectId="p1"
        activeProjectId="p1"
        projects={projects}
        onClose={() => {
          closes.value++
          setOpen(false)
        }}
      />
    )),
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

const model = { providerID: "kilo", modelID: "m1" }
await emit({ type: "agentsLoaded", agents: [{ name: "code" }], defaultAgent: "code" })
await emit({
  type: "providersLoaded",
  organizationId: null,
  ready: true,
  providers: { kilo: { id: "kilo", name: "Kilo", models: { m1: { id: "m1", name: "M1" } } } },
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
const readiness = () =>
  sent.flatMap((item) =>
    item.type === "telemetry" && item.event === "Agent Manager Worktree Readiness" ? [item.properties] : [],
  )
const card = () => document.querySelector<HTMLElement>(".am-readiness")
const reply = (projectId: string, requestID: string, result: Readiness) =>
  emit({ type: "agentManager.readiness", projectId, requestID, result })
const shortcut = () =>
  prompt().dispatchEvent(
    new window.KeyboardEvent("keydown", { key: "Enter", metaKey: true, ctrlKey: true, bubbles: true }) as never,
  )
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
  assert.equal(checks().at(0)?.projectId, "p1")
  return checks().at(0)!.requestID
}
const plain: Readiness = { status: "blocked", code: "not_git_repo", name: "scratch", trusted: true, identity: true }

// A blocked reply keeps the dialog open with every field, and Create is aria-disabled rather than disabled.
{
  const id = await mount()
  const area = prompt()
  area.value = "build the thing"
  area.dispatchEvent(new window.Event("input", { bubbles: true }) as never)
  const pill = Array.from(document.querySelectorAll<HTMLButtonElement>(".am-nv-pill")).find(
    (item) => item.textContent?.trim() === "3",
  )
  assert.ok(pill)
  pill.click()
  await reply("p1", id, plain)

  assert.equal(card()?.querySelector("[data-readiness-title]")?.textContent, "agentManager.readiness.plain.title")
  assert.equal(submit().getAttribute("aria-disabled"), "true")
  assert.equal(submit().disabled, false)

  submit().click()
  await settle()
  assert.equal(creates().length, 0)
  assert.equal(closes.value, 0)
  assert.equal(prompt().value, "build the thing")
  assert.ok(document.querySelector(".am-nv-pill-active")?.textContent?.includes("3"))
  assert.equal(document.querySelectorAll(".image-attachment").length, 1)
  const action = card()?.querySelector<HTMLElement>("[data-readiness-action]")
  assert.equal(action?.textContent, "agentManager.readiness.plain.action")
  assert.equal(document.activeElement, action)

  // Cmd/Ctrl+Enter from the prompt also lands on the card's action and creates nothing.
  prompt().focus()
  shortcut()
  await settle()
  assert.equal(creates().length, 0)
  assert.equal(document.activeElement, action)

  // Replies for another project or an older request are ignored.
  await reply("p2", id, { status: "ready" })
  await reply("p1", "readiness-stale-check-1", { status: "ready" })
  assert.equal(submit().getAttribute("aria-disabled"), "true")

  // Check again; reaching ready clears the card but never creates on its own or takes focus.
  const again = Array.from(card()?.querySelectorAll<HTMLButtonElement>("button") ?? []).find(
    (item) => item.textContent === "agentManager.readiness.check",
  )
  assert.ok(again)
  again.click()
  await settle()
  assert.equal(checks().length, 2)
  prompt().focus()
  await reply("p1", checks().at(1)!.requestID, { status: "ready" })
  assert.equal(card()?.textContent, "")
  assert.equal(submit().getAttribute("aria-disabled"), null)
  assert.equal(creates().length, 0)
  assert.equal(document.activeElement, prompt())

  // One event per real transition, not per re-check.
  assert.deepEqual(readiness(), [
    { stage: "identified", code: "not_git_repo", entry: "modal" },
    { stage: "resolved", code: "not_git_repo", entry: "modal" },
  ])

  // With a current ready result, Create proceeds at once.
  submit().click()
  await settle()
  assert.equal(creates().length, 1)
  assert.equal(closes.value, 1)
}

// Activations while the check is pending wait for it and create exactly once.
{
  const id = await mount()
  submit().click()
  submit().click()
  shortcut()
  await settle()
  assert.equal(creates().length, 0)
  assert.equal(checks().length, 1)
  await reply("p2", id, { status: "ready" })
  assert.equal(creates().length, 0)
  await reply("p1", id, { status: "ready" })
  assert.equal(creates().length, 1)
  assert.equal(closes.value, 1)
}

// A blocked reply to a pending submit ends that submit.
{
  const id = await mount()
  submit().click()
  await reply("p1", id, plain)
  assert.equal(creates().length, 0)
  assert.equal(closes.value, 0)
  assert.equal(document.activeElement, card()?.querySelector("[data-readiness-action]"))
  await close()
  assert.deepEqual(readiness(), [
    { stage: "identified", code: "not_git_repo", entry: "modal" },
    { stage: "abandoned", code: "not_git_repo", entry: "modal" },
  ])
}

// A fix owns the state even when an earlier manual check replies after it finishes.
{
  const id = await mount()
  await reply("p1", id, plain)
  const again = Array.from(card()?.querySelectorAll<HTMLButtonElement>("button") ?? []).find(
    (item) => item.textContent === "agentManager.readiness.check",
  )
  assert.ok(again)
  again.click()
  await settle()
  const pending = checks().at(-1)!.requestID
  card()?.querySelector<HTMLButtonElement>("[data-readiness-action]")?.click()
  await settle()
  const fix = sent.find((item) => item.type === "agentManager.fixReadiness")
  assert.ok(fix && fix.type === "agentManager.fixReadiness")
  assert.equal(fix.fix, "initGit")
  assert.ok(card()?.querySelector("[role=status]"))
  assert.equal(creates().length, 0)
  await emit({
    type: "agentManager.readiness",
    projectId: "p1",
    requestID: fix.requestID,
    result: { status: "ready", note: "uncommitted" },
  })
  assert.ok(card()?.textContent?.includes("agentManager.readiness.ready.initGit"))
  assert.equal(document.activeElement, submit())
  await reply("p1", pending, plain)
  assert.equal(submit().getAttribute("aria-disabled"), null)
  assert.ok(card()?.textContent?.includes("agentManager.readiness.ready.initGit"))
  assert.equal(creates().length, 0)
  assert.equal(closes.value, 0)
  assert.deepEqual(readiness(), [
    { stage: "identified", code: "not_git_repo", entry: "modal" },
    { stage: "fix_started", code: "not_git_repo", fix: "initGit", entry: "modal" },
    { stage: "resolved", code: "not_git_repo", fix: "initGit", entry: "modal" },
  ])
}

// Closing a pending submit cancels it without creating or reporting a late unknown transition.
{
  const id = await mount()
  submit().click()
  await close()
  await reply("p1", id, { status: "ready" })
  assert.equal(creates().length, 0)
  assert.deepEqual(readiness(), [])
}

// An invalid branch name stops a ready submit before anything is created, cleared or closed.
{
  const id = await mount()
  await reply("p1", id, { status: "ready" })
  const branch = document.querySelector<HTMLInputElement>(".am-nv-branch-input")
  assert.ok(branch)
  branch.value = "../escape"
  branch.dispatchEvent(new window.Event("input", { bubbles: true }) as never)
  submit().click()
  await settle()
  assert.equal(creates().length, 0)
  assert.equal(closes.value, 0)
  assert.equal(submit().disabled, false)
  await close()
}

// With no reply before the deadline, Create behaves as it does today.
{
  await mount()
  submit().click()
  await settle()
  assert.equal(creates().length, 0)
  await new Promise((done) => setTimeout(done, 3_200))
  await settle()
  assert.equal(creates().length, 1)
  assert.equal(closes.value, 1)
}

dispose()
await window.happyDOM.abort()
window.close()

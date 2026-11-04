import assert from "node:assert/strict"
import { Window } from "happy-dom"
import type { Readiness, WebviewMessage } from "../../webview-ui/src/types/messages"

const window = new Window({ url: "http://localhost" })
Object.defineProperty(window, "origin", { value: window.location.origin })
const sent: WebviewMessage[] = []
// A valid saved model is required, or Create stays disabled regardless of readiness.
const saved: Record<string, unknown> = {
  advancedDialogSelections: { model: { providerID: "kilo", modelID: "m1" } },
  advancedDialogImages: [{ id: "img", filename: "shot.png", mime: "image/png", dataUrl: "data:image/png;base64,AAAA" }],
}
const api = {
  postMessage: (message: WebviewMessage) => sent.push(structuredClone(message)),
  getState: () => saved,
  setState: (next: Record<string, unknown>) => {
    if ("advancedDialogReopen" in next) saved.advancedDialogReopen = next.advancedDialogReopen
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
  const [closing, setClosing] = createSignal(false)
  onCleanup(() => dialog.close())
  onMount(() =>
    dialog.show(
      () => (
        <NewWorktreeDialog
          closing={closing}
          mode={createModeRouter()}
          projectId="p1"
          activeProjectId="p1"
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

// Deliver the reply in the same turn as close, while the real dialog is still mounted.
for (const method of ["escape", "button"]) {
  if (process.env.READINESS_CASE && process.env.READINESS_CASE !== method) continue
  const id = await mount()
  submit().click()
  if (method === "escape") {
    document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }) as never)
  } else {
    document.querySelector<HTMLButtonElement>(".am-nv-close")!.click()
  }
  assert.ok(document.querySelector(".am-nv-submit"), "reply must arrive before exit cleanup")
  post({ type: "agentManager.readiness", projectId: "p1", requestID: id, result: { status: "ready" } })
  // Drain the request's chained continuations, not the 100 ms exit timer.
  for (let turn = 0; turn < 12; turn++) await Promise.resolve()
  assert.equal(creates().length, 0, `${method}: close-start must cancel submit`)
  assert.ok(document.querySelector(".am-nv-submit"), "assert before exit cleanup")
  await close()
}

if (!process.env.READINESS_CASE || process.env.READINESS_CASE === "projects") {
  const id = await mount()
  submit().click()
  for (const target of ["p2", "p1"]) {
    document.querySelector<HTMLButtonElement>(".am-nv-origin-project")!.click()
    await settle()
    const option = Array.from(document.querySelectorAll<HTMLButtonElement>(".am-project-option")).find((item) =>
      item.textContent?.includes(target),
    )
    assert.ok(option, `missing project ${target}`)
    option.click()
    await settle()
  }
  const gate = checks().at(1)!
  assert.equal(gate.verify, true)
  await reply("p1", gate.requestID, { status: "ready" })
  assert.equal(creates().length, 0, "returning to A must not resume A's original submit")
  assert.equal(checks().length, 4, "returning to A must send a new request")
  await settle()
  submit().click()
  await reply("p1", id, { status: "ready" })
  assert.equal(creates().length, 0, "old A reply must not unlock the newer gate")
  const current = checks().at(-1)!
  assert.equal(current.verify, true)
  assert.notEqual(current.requestID, gate.requestID)
  await reply("p1", current.requestID, { status: "ready" })
  await settle()
  assert.equal(creates().length, 1)
  await close()
}

// A switch fix keeps the selected project's result: switching must not wipe the card.
if (!process.env.READINESS_CASE || process.env.READINESS_CASE === "switch") {
  for (const target of ["blocked", "ready"] as const) {
    const id = await mount()
    await reply("p1", id, {
      status: "blocked",
      code: "not_git_repo",
      name: "parent",
      trusted: true,
      projects: [{ root: "/p2", label: "p2" }],
    })
    card()?.querySelector<HTMLButtonElement>("[data-readiness-action]")?.click()
    await settle()
    const fix = sent.find((item) => item.type === "agentManager.fixReadiness")
    assert.ok(fix && fix.type === "agentManager.fixReadiness")
    await emit({
      type: "agentManager.readiness",
      projectId: "p1",
      requestID: fix.requestID,
      selected: "p2",
      result: target === "ready" ? { status: "ready" } : plain,
    })
    assert.equal(creates().length, 0)
    if (target === "blocked") {
      assert.equal(card()?.querySelector("[data-readiness-title]")?.textContent, "agentManager.readiness.plain.title")
      assert.equal(submit().getAttribute("aria-disabled"), "true")
    } else {
      assert.equal(card()?.textContent, "")
      assert.equal(submit().getAttribute("aria-disabled"), null)
      assert.equal(document.activeElement, submit())
    }
    await close()
  }
}

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

  // A current ready result still re-probes the tools before Create.
  submit().click()
  await settle()
  assert.equal(creates().length, 0)
  const verify = checks().at(-1)!
  assert.equal(verify.verify, true)
  assert.equal(verify.fresh, false)
  await reply("p1", verify.requestID, { status: "ready" })
  assert.equal(creates().length, 1)
  assert.equal(closes.value, 1)
}

// A cached ready result still blocks Create when the tool disappeared.
{
  const id = await mount()
  await reply("p1", id, { status: "ready" })
  const closed = closes.value
  submit().click()
  await settle()
  const verify = checks().at(-1)!
  assert.equal(verify.verify, true)
  await reply("p1", verify.requestID, {
    status: "blocked",
    code: "git_not_found",
    name: "p1",
    trusted: true,
    platform: "darwin",
    installer: "apple",
  })
  assert.equal(creates().length, 0)
  assert.equal(closes.value, closed)
  assert.equal(card()?.querySelector("[data-readiness-title]")?.textContent, "agentManager.readiness.git.title")
  await close()
}

// Activations while the check is pending wait for it and create exactly once.
{
  const id = await mount()
  submit().click()
  submit().click()
  shortcut()
  await settle()
  assert.equal(creates().length, 0)
  assert.equal(checks().length, 2)
  const verify = checks().at(1)!
  assert.equal(verify.verify, true)
  await reply("p2", verify.requestID, { status: "ready" })
  assert.equal(creates().length, 0)
  await reply("p1", id, { status: "ready" })
  assert.equal(creates().length, 0)
  await reply("p1", verify.requestID, { status: "ready" })
  assert.equal(creates().length, 1)
  assert.equal(closes.value, 1)
}

// A blocked reply to a pending submit ends that submit.
{
  await mount()
  submit().click()
  const verify = checks().at(-1)!
  assert.equal(verify.verify, true)
  await reply("p1", verify.requestID, plain)
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
  const verify = checks().at(-1)!
  assert.equal(verify.verify, true)
  await reply("p1", verify.requestID, { status: "ready" })
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

// A project whose branch list is empty or failed shows the no-branches state.
{
  const id = await mount()
  await emit({ type: "agentManager.branches", projectId: "p1", branches: [], defaultBranch: "main" })
  const branch = document.querySelector<HTMLButtonElement>(".am-nv-origin-branch")
  assert.ok(branch)
  assert.ok(branch.textContent?.includes("agentManager.import.noBranchesFound"))
  assert.equal(branch.querySelector(".am-branch-badge"), null)
  await reply("p1", id, { status: "ready" })
  await close()
}

// Git and Git LFS: install from the card, finish in Apple's window, fresh-check on return,
// and offer Reload only after a terminal install that VS Code cannot see yet.
if (process.env.READINESS_CASE === "install") {
  const git: Readiness = {
    status: "blocked",
    code: "git_not_found",
    name: "p1",
    trusted: true,
    platform: "darwin",
    installer: "apple",
  }
  const lfs: Readiness = {
    status: "blocked",
    code: "lfs_missing",
    name: "orbit",
    trusted: true,
    platform: "darwin",
    installer: "brew",
  }
  const details = () => {
    const trigger = Array.from(card()?.querySelectorAll<HTMLElement>("button") ?? []).find(
      (item) => item.textContent === "error.details.show",
    )
    assert.ok(trigger)
    trigger.click()
  }
  const install = async (result: Readiness) => {
    card()?.querySelector<HTMLButtonElement>("[data-readiness-action]")?.click()
    await settle()
    const fix = sent.filter((item) => item.type === "agentManager.fixReadiness").at(-1)
    assert.ok(fix && fix.type === "agentManager.fixReadiness")
    return fix
  }

  // Apple: Check again escapes to the Git card, and a different blocker wins.
  const apple = await mount()
  await reply("p1", apple, git)
  assert.equal(card()?.querySelector("[data-readiness-title]")?.textContent, "agentManager.readiness.git.title")
  assert.equal(submit().getAttribute("aria-disabled"), "true")
  const first = await install(git)
  assert.equal(first.fix, "installGit")
  assert.ok(card()?.querySelector("[role=status]"))
  await emit({
    type: "agentManager.readiness",
    projectId: "p1",
    requestID: first.requestID,
    result: git,
    install: { kind: "git", mode: "apple", ok: false },
  })
  assert.equal(card()?.querySelector("[role=status] span")?.textContent, "agentManager.readiness.install.apple.title")
  card()?.querySelector<HTMLButtonElement>(".am-readiness-check")?.click()
  await settle()
  const retry = checks().at(-1)
  assert.ok(retry)
  assert.equal(retry.fresh, true)
  await reply("p1", retry.requestID, git)
  assert.equal(card()?.querySelector("[data-readiness-title]")?.textContent, "agentManager.readiness.git.title")
  assert.ok(card()?.querySelector("[data-readiness-action]"))

  const again = await install(git)
  assert.equal(again.fix, "installGit")
  await emit({
    type: "agentManager.readiness",
    projectId: "p1",
    requestID: again.requestID,
    result: git,
    install: { kind: "git", mode: "apple", ok: false },
  })
  assert.equal(card()?.querySelector("[role=status] span")?.textContent, "agentManager.readiness.install.apple.title")
  card()?.querySelector<HTMLButtonElement>(".am-readiness-check")?.click()
  await settle()
  const different = checks().at(-1)
  assert.ok(different)
  await reply("p1", different.requestID, {
    status: "blocked",
    code: "no_commits",
    name: "p1",
    trusted: true,
    identity: true,
  })
  assert.equal(card()?.querySelector("[data-readiness-title]")?.textContent, "agentManager.readiness.commit.title")
  assert.equal(card()?.querySelector("[role=status]"), null)
  assert.equal(creates().length, 0)
  await close()

  // Apple: Other ways stays live and a window return focuses Create.
  const otherway = await mount()
  await reply("p1", otherway, git)
  const opening = await install(git)
  await emit({
    type: "agentManager.readiness",
    projectId: "p1",
    requestID: opening.requestID,
    result: git,
    install: { kind: "git", mode: "apple", ok: false },
  })
  const other = Array.from(card()?.querySelectorAll<HTMLButtonElement>(".am-readiness-link") ?? []).find(
    (item) => item.textContent === "agentManager.readiness.tool.other",
  )
  assert.ok(other)
  other.click()
  await settle()
  const download = sent.find((item) => item.type === "agentManager.fixReadiness" && item.fix === "downloadGit")
  assert.ok(download && download.type === "agentManager.fixReadiness")
  await emit({ type: "agentManager.readiness", projectId: "p1", requestID: download.requestID, result: git })
  assert.equal(card()?.querySelector("[role=status] span")?.textContent, "agentManager.readiness.install.apple.title")
  card()?.querySelector<HTMLButtonElement>(".am-readiness-check")?.focus()
  await emit({ type: "agentManager.readinessFocus" })
  const fresh = checks().at(-1)
  assert.ok(fresh)
  assert.equal(fresh.fresh, true)
  await reply("p1", fresh.requestID, { status: "ready" })
  assert.ok(card()?.textContent?.includes("agentManager.readiness.ready.git"))
  assert.equal(submit().getAttribute("aria-disabled"), null)
  assert.equal(document.activeElement, submit())
  assert.equal(creates().length, 0)
  await close()

  // A focused prompt keeps focus after a window-return recovery.
  const typing = await mount()
  await reply("p1", typing, git)
  const started = await install(git)
  await emit({
    type: "agentManager.readiness",
    projectId: "p1",
    requestID: started.requestID,
    result: git,
    install: { kind: "git", mode: "apple", ok: false },
  })
  const input = document.querySelector<HTMLTextAreaElement>(".am-prompt-input")
  assert.ok(input)
  input.focus()
  await emit({ type: "agentManager.readinessFocus" })
  const typed = checks().at(-1)
  assert.ok(typed)
  await reply("p1", typed.requestID, { status: "ready" })
  assert.ok(card()?.textContent?.includes("agentManager.readiness.ready.git"))
  assert.equal(document.activeElement, input)
  await close()

  // A terminal install keeps Installing even when a focus check still misses it,
  // and offers no second install while the task runs.
  const second = await mount()
  await reply("p1", second, lfs)
  assert.equal(card()?.querySelector("[data-readiness-title]")?.textContent, "agentManager.readiness.lfs.title")
  const fix = await install(lfs)
  assert.equal(fix.fix, "installLfs")
  assert.equal(card()?.querySelectorAll("[data-readiness-action]").length, 0)
  assert.equal(card()?.querySelector(".am-readiness-check"), null)
  await emit({ type: "agentManager.readinessFocus" })
  const live = checks().at(-1)
  assert.ok(live)
  assert.equal(live.fresh, true)
  await reply("p1", live.requestID, { status: "blocked", code: "lfs_missing", name: "orbit", trusted: true })
  assert.equal(
    card()?.querySelector("[role=status] span")?.textContent,
    "agentManager.readiness.install.terminal.title",
  )
  assert.equal(sent.filter((item) => item.type === "agentManager.fixReadiness").length, 1)

  // A failed terminal task that still misses the tool is blocked with its exit code.
  await emit({
    type: "agentManager.readiness",
    projectId: "p1",
    requestID: fix.requestID,
    result: lfs,
    install: { kind: "lfs", mode: "terminal", ok: false, code: 1 },
  })
  assert.equal(card()?.querySelector("[data-readiness-title]")?.textContent, "agentManager.readiness.lfs.title")
  details()
  assert.ok(
    card()?.querySelector(".am-readiness-details")?.textContent?.includes("agentManager.readiness.install.failed"),
  )
  assert.equal(card()?.querySelector(".am-readiness-check")?.textContent, "agentManager.readiness.check")
  assert.equal(
    sent.some((item) => item.type === "agentManager.reloadWindow"),
    false,
  )
  await close()

  // A stopped terminal task is blocked with the stopped message, not Reload.
  const stopped = await mount()
  await reply("p1", stopped, lfs)
  const stalled = await install(lfs)
  await emit({
    type: "agentManager.readiness",
    projectId: "p1",
    requestID: stalled.requestID,
    result: lfs,
    install: { kind: "lfs", mode: "terminal", ok: false, stopped: true },
  })
  assert.equal(card()?.querySelector("[data-readiness-title]")?.textContent, "agentManager.readiness.lfs.title")
  details()
  assert.ok(
    card()?.querySelector(".am-readiness-details")?.textContent?.includes("agentManager.readiness.install.stopped"),
  )
  assert.equal(
    sent.some((item) => item.type === "agentManager.reloadWindow"),
    false,
  )
  await close()

  // A successful terminal install that VS Code cannot see yet is the only path to Reload.
  const third = await mount()
  await reply("p1", third, lfs)
  const stale = await install(lfs)
  await emit({
    type: "agentManager.readiness",
    projectId: "p1",
    requestID: stale.requestID,
    result: lfs,
    install: { kind: "lfs", mode: "terminal", ok: true },
  })
  assert.equal(
    card()?.querySelector("[data-readiness-title]")?.textContent,
    "agentManager.readiness.install.stale.title",
  )
  assert.ok(card()?.textContent?.includes("agentManager.readiness.install.stale.body"))
  assert.equal(card()?.querySelector(".am-readiness-check")?.textContent, "agentManager.readiness.check")
  assert.equal(
    sent.some((item) => item.type === "agentManager.reloadWindow"),
    false,
  )
  card()?.querySelector<HTMLButtonElement>("[data-readiness-action]")?.click()
  await settle()
  assert.equal(saved.advancedDialogReopen, true)
  assert.equal(
    sent.some((item) => item.type === "agentManager.reloadWindow"),
    true,
  )
  assert.equal(creates().length, 0)
  await close()

  // Focus is ignored unless a Git/LFS card is showing.
  const healthy = await mount()
  await reply("p1", healthy, { status: "ready" })
  const before = checks().length
  await emit({ type: "agentManager.readinessFocus" })
  assert.equal(checks().length, before)
  await close()

  const commits = await mount()
  await reply("p1", commits, { status: "blocked", code: "no_commits", name: "p1", trusted: true, identity: true })
  const blocked = checks().length
  await emit({ type: "agentManager.readinessFocus" })
  assert.equal(checks().length, blocked)
  await close()
}

dispose()
await window.happyDOM.abort()
window.close()

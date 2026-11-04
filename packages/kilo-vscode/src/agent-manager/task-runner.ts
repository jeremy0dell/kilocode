/**
 * VS Code adapter implementing the RunTask callback via vscode.tasks API.
 */

import * as vscode from "vscode"
import { setupTaskIdentity, type SetupTaskConfig } from "./SetupScriptRunner"

const GRACE_MS = 250
const TIMEOUT_MS = 5 * 60 * 1000

export interface TaskOptions {
  /** Override the task name shown in the terminal and task list. */
  name?: string
  /** Wall-clock budget; the default matches the setup script's five minutes. */
  timeout?: number
  /** Terminate the task when the budget expires. Installs only; setup scripts keep running. */
  stop?: boolean
}

export async function executeVscodeTask(
  config: SetupTaskConfig,
  options: TaskOptions = {},
): Promise<number | undefined> {
  const execution = new vscode.ProcessExecution(config.command, config.args, {
    cwd: config.cwd,
    env: config.env,
  })
  const identity = setupTaskIdentity(config)
  const task = new vscode.Task(
    identity.definition,
    vscode.TaskScope.Workspace,
    options.name ?? identity.name,
    "Kilo Code",
    execution,
    [],
  )
  task.presentationOptions = {
    reveal: vscode.TaskRevealKind.Always,
    panel: vscode.TaskPanelKind.Dedicated,
    clear: true,
    showReuseMessage: false,
  }

  // A start failure means the script did not run. Reject so SetupScriptRunner
  // logs and reports it instead of treating the skip as success.
  const started = await Promise.resolve(vscode.tasks.executeTask(task)).catch((error: unknown) => {
    throw new Error(
      `Failed to start ${options.name ?? "setup task"}: ${error instanceof Error ? error.message : String(error)}`,
    )
  })

  return new Promise((resolve, reject) => {
    let done = false
    let grace: ReturnType<typeof setTimeout> | undefined
    let timeout: ReturnType<typeof setTimeout> | undefined

    const finish = (code?: number, error?: Error) => {
      if (done) return
      done = true
      if (grace) clearTimeout(grace)
      if (timeout) clearTimeout(timeout)
      processListener.dispose()
      endListener.dispose()
      if (error) reject(error)
      else resolve(code)
    }

    const processListener = vscode.tasks.onDidEndTaskProcess((event) => {
      if (event.execution !== started) return
      finish(event.exitCode ?? undefined)
    })

    const endListener = vscode.tasks.onDidEndTask((event) => {
      if (event.execution !== started) return
      if (done) return
      grace = setTimeout(() => finish(undefined), GRACE_MS)
    })

    const budget = options.timeout ?? TIMEOUT_MS
    timeout = setTimeout(() => {
      if (options.stop) void Promise.resolve(started.terminate()).catch(() => undefined)
      const message = options.stop
        ? `Task timed out after ${Math.round(budget / 60_000)} minutes`
        : "Setup script timed out after 5 minutes"
      finish(undefined, new Error(message))
    }, budget)
  })
}

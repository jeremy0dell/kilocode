/**
 * PATH lookups for tool executables. Case-insensitive on Windows, where the
 * environment usually calls the variable `Path` rather than `PATH`.
 */

import { constants } from "node:fs"
import * as fs from "node:fs/promises"
import * as path from "node:path"

/** Read an environment variable by name, matching case on Windows. */
function envValue(
  env: NodeJS.ProcessEnv,
  name: string,
  platform: NodeJS.Platform = process.platform,
): string | undefined {
  if (platform !== "win32") return env[name]
  const key = Object.keys(env).find((item) => item.toUpperCase() === name.toUpperCase())
  return key ? env[key] : undefined
}

/** First PATH entry that contains an executable named `name`. */
export function lookup(
  name: string,
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform = process.platform,
): Promise<string | undefined> {
  const dirs = (envValue(env, "PATH", platform) ?? "").split(path.delimiter).filter(Boolean)
  const exts = platform === "win32" ? (envValue(env, "PATHEXT", platform) ?? ".EXE;.CMD;.BAT;.COM").split(";") : [""]
  const mode = platform === "win32" ? constants.F_OK : constants.X_OK
  const next = (index: number, ext: number): Promise<string | undefined> => {
    const dir = dirs[index]
    const suffix = exts[ext]
    if (dir === undefined) return Promise.resolve(undefined)
    if (suffix === undefined) return next(index + 1, 0)
    const file = path.join(dir, `${name}${suffix}`)
    return fs.stat(file).then(
      (info) =>
        info.isFile()
          ? fs.access(file, mode).then(
              () => file,
              () => next(index, ext + 1),
            )
          : next(index, ext + 1),
      () => next(index, ext + 1),
    )
  }
  return next(0, 0)
}

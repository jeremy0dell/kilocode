import { Show, type JSX } from "solid-js"
import type { SessionInfo } from "../../src/types/messages"
import { SplashExpanded, SplashFolded } from "../splash/Splash"
import type { SplashState } from "../splash/state"
import "./intro.css"

export function createIntro(opts: {
  sessions?: () => SessionInfo[]
  onCreateWorktree: () => void
  onSelectSession?: (id: string) => void
  onShowHistory?: () => void
  focus: () => void
  start: () => void
  hints?: () => JSX.Element
  splash: SplashState
}) {
  return {
    introduction: () => !opts.splash.folded(),
    folded: opts.splash.folded,
    render: (): JSX.Element => (
      <Show
        when={!opts.splash.folded()}
        fallback={
          <SplashFolded
            sessions={opts.sessions}
            onSelectSession={opts.onSelectSession}
            onShowHistory={opts.onShowHistory}
            hints={opts.hints}
            onShowExamples={() => {
              opts.splash.unfold()
              opts.focus()
            }}
          />
        }
      >
        <SplashExpanded
          onHide={() => {
            opts.splash.fold()
            opts.focus()
          }}
          onStart={opts.start}
          onCreateWorktree={opts.onCreateWorktree}
        />
      </Show>
    ),
  }
}

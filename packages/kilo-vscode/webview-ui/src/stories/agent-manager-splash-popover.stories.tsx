/** @jsxImportSource solid-js */
import { createSignal, For } from "solid-js"
import type { Meta, StoryObj } from "storybook-solidjs-vite"
import { Button } from "@kilocode/kilo-ui/button"
import { SplashPopover } from "../../agent-manager/splash/Popover"
import "../../agent-manager/splash/splash.css"

const meta: Meta = {
  title: "AgentManager/Splash Popover",
  parameters: { layout: "centered" },
}
export default meta
type Story = StoryObj

export const Thin: Story = {
  render: () => {
    const [selected, select] = createSignal(0)
    const [open, show] = createSignal(true)
    const features = [
      { name: "Multi-repo projects", text: "Keep agents working across your repositories in one place." },
      { name: "Live session status", text: "Follow progress without switching away from your current task." },
      { name: "PR badges and diff counts", text: "See which changes are ready to review and compare the results." },
    ]
    let container!: HTMLDivElement
    let frame!: HTMLDivElement
    let scroller!: HTMLDivElement
    const rows: HTMLDivElement[] = []
    const markers: HTMLButtonElement[] = []
    const choose = (index: number) => {
      select(index)
      show(true)
    }
    return (
      <div ref={container} style={{ position: "relative", width: "300px" }}>
        <div ref={frame} style={{ height: "340px", border: "1px solid var(--border-base)", overflow: "hidden" }}>
          <div style={{ padding: "12px" }}>PROJECTS</div>
          <div ref={scroller} style={{ height: "290px", overflow: "auto", "padding-bottom": "28px" }}>
            <For each={features}>
              {(feature, index) => (
                <div
                  ref={(element) => (rows[index()] = element)}
                  style={{ display: "flex", "align-items": "center", padding: "28px 12px", gap: "8px" }}
                >
                  <span style={{ flex: "1", "min-width": "0" }}>{feature.name}</span>
                  <Button
                    ref={(element: HTMLButtonElement) => (markers[index()] = element)}
                    size="small"
                    variant="ghost"
                    aria-label={`Feature ${index() + 1}: ${feature.name}`}
                    aria-expanded={open() && selected() === index()}
                    aria-controls="splash-popover-story"
                    onClick={() => {
                      if (selected() === index() && open()) return show(false)
                      choose(index())
                    }}
                    onKeyDown={(event: KeyboardEvent) => {
                      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return
                      event.preventDefault()
                      const next = (index() + (event.key === "ArrowLeft" || event.key === "ArrowUp" ? 2 : 1)) % 3
                      choose(next)
                      markers.at(next)?.focus({ preventScroll: true })
                    }}
                  >
                    {index() + 1}
                  </Button>
                </div>
              )}
            </For>
          </div>
        </div>
        <SplashPopover
          id="splash-popover-story"
          features={features}
          selected={selected()}
          open={open()}
          onSelect={choose}
          onClose={() => show(false)}
          anchor={(index) => rows.at(index)?.getBoundingClientRect()}
          markers={() => markers.map((marker) => marker.getBoundingClientRect())}
          frame={() => frame}
          rows={() => scroller}
          container={() => container}
          previousLabel="Previous feature"
          nextLabel="Next feature"
        />
      </div>
    )
  },
}

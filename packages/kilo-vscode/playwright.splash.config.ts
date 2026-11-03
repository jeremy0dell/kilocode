import { defineConfig } from "@playwright/test"
import config from "./playwright.config"

export default defineConfig({
  ...config,
  testMatch: "**/agent-manager-splash.spec.ts",
  use: { ...config.use, baseURL: "http://localhost:6031" },
  webServer: {
    command: "bunx storybook dev -p 6031 --ci --no-open",
    url: "http://localhost:6031",
    reuseExistingServer: !process.env["CI"],
    timeout: 300_000,
  },
})

import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: "./tests",
  testMatch: "splash-carousel.spec.ts",
  outputDir: "test-results/splash-carousel",
  workers: 1,
  expect: { timeout: 15_000 },
  reporter: "list",
  use: {
    baseURL: "http://localhost:6021",
    reducedMotion: "reduce",
  },
  webServer: {
    command: "bunx storybook dev --port 6021 --ci --no-open",
    port: 6021,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})

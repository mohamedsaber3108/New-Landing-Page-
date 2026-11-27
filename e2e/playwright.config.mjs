// End-to-end workflow suite (D-03, L-Q3). Runs only in CI (job "e2e
// workflows"), against the built Worker started with `npm start` (wrangler
// dev --local, Miniflare) and a fresh local D1 with all migrations applied.
// @playwright/test and @axe-core/playwright are installed in that job with
// --no-save at pinned versions; they are not project dependencies.
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: /.*\.spec\.mjs$/,
  // One shared server and database: run serially so admin read-backs are simple.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  forbidOnly: true,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } } }],
});

import { defineConfig, devices } from "@playwright/test";

import { loadLocalEnv, missingHostedVariables } from "./src/test/env";

/**
 * The browser smoke test (`pnpm test:e2e`): one test, against a production build of the app
 * served on its own port, so it runs beside a development server. Without the hosted project
 * and a Claude API key the test skips itself with a reason and no server is started.
 */

loadLocalEnv();

const port = Number(process.env.E2E_PORT ?? 3010);
const baseURL = `http://localhost:${port}`;
const configured = missingHostedVariables({ anthropic: true }).length === 0;

export default defineConfig({
  testDir: "e2e",
  // The model answers in well under a minute; the rest is the build and page loads.
  timeout: 150_000,
  expect: { timeout: 15_000 },
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // `next dev` refuses to start beside a development server already running in this
  // directory, so the test serves a production build instead.
  webServer: configured
    ? {
        command: `pnpm build && pnpm start -p ${port}`,
        url: `${baseURL}/health`,
        reuseExistingServer: !process.env.CI,
        timeout: 300_000,
        stdout: "ignore",
        stderr: "pipe",
      }
    : undefined,
});

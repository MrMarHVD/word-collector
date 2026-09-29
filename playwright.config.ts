import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for token-efficient, headless behavioural smoke tests.
 *
 * Design goals:
 *  - Run entirely in Node (no MCP), so assertions never enter the agent's context.
 *  - Emit minimal output: the `line` reporter prints a compact pass/fail summary;
 *    screenshots and traces are captured ONLY on failure, and viewed only when needed.
 *  - Reuse a seeded test user via `storageState` so specs skip the login flow.
 *
 * Servers: the `webServer` block auto-starts the Vite dev server (port from
 * PW_FRONTEND_URL, default 5173, proxying `/api` to the API) and the API (port from
 * PW_API_URL, default 3000), reusing already-running dev servers when present.
 */

const FRONTEND_URL = process.env.PW_FRONTEND_URL ?? "http://localhost:5173";
const API_URL = process.env.PW_API_URL ?? "http://localhost:3000";

/** Returns the port a URL listens on (URL#port is empty for the scheme's default port). */
function portOf(url: string): string {
  const { port, protocol } = new URL(url);
  return port || (protocol === "https:" ? "443" : "80");
}
const FRONTEND_PORT = portOf(FRONTEND_URL);
const API_PORT = portOf(API_URL);

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  // Compact, low-token output. Use `--reporter=html` locally for a rich report.
  reporter: process.env.CI ? "github" : "line",

  use: {
    baseURL: FRONTEND_URL,
    headless: true,
    // Artefacts only on failure — keeps successful runs near-zero overhead.
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "off",
  },

  projects: [
    // Seeds + authenticates once, writing tests/.auth/user.json.
    { name: "setup", testMatch: /.*\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: "tests/.auth/user.json" },
      dependencies: ["setup"],
    },
  ],

  // Ensures the seeded test user exists in the dev DB before any test runs.
  globalSetup: "./tests/global-setup.ts",

  webServer: [
    {
      command: `PORT=${API_PORT} CORS_ORIGIN=${FRONTEND_URL} API_URL=${API_URL} npm run dev:api`,
      url: `${API_URL}/api/auth/me`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: `PORT=${FRONTEND_PORT} API_PROXY_TARGET=${API_URL} npm run dev:web`,
      url: FRONTEND_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});

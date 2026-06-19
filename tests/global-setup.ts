import { execFileSync } from "node:child_process";
import path from "node:path";

/**
 * Global setup: idempotently provisions the Playwright test user in the dev
 * Postgres DB by running the backend's `provision_admin.js` script.
 *
 * This is non-destructive: the script only inserts the test account or resets
 * its password; no other rows or users are touched. Runs once per `npx playwright test`.
 */
export const TEST_EMAIL = process.env.PW_TEST_EMAIL ?? "playwright-test@example.com";
export const TEST_PASSWORD = process.env.PW_TEST_PASSWORD ?? "Playwright123";

// Playwright runs from the project root, so resolve the seed script from cwd.
const script = path.resolve(process.cwd(), "backend/scripts/provision_admin.js");

export default function globalSetup() {
  execFileSync("node", [script], {
    stdio: "inherit",
    env: { ...process.env, ADMIN_EMAIL: TEST_EMAIL, ADMIN_PASSWORD: TEST_PASSWORD },
  });
}

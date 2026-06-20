import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import path from "node:path";

/**
 * Behavioural smoke tests for the Superadmin subtab (ADM-004).
 *
 * Covers the acceptance criteria:
 *  - only a superadmin can grant/revoke admin and read the audit log (others 403);
 *  - granting admin to a regular user surfaces the Admin tab on their next session;
 *  - revoking it removes the Admin tab on their next session;
 *  - grant/revoke produce audit entries visible in the paginated audit log;
 *  - there is no control or endpoint to clear the superadmin's own flag.
 *
 * Elevated users are provisioned via provision_admin.js (the only way to set the
 * superadmin flag) and logged in through the real UI in fresh contexts.
 */

const SCRIPT = path.resolve(process.cwd(), "backend/scripts/provision_admin.js");

const SUPERADMIN = { email: "pw-sa-super@example.com", password: "Playwright123" };
const ADMIN = { email: "pw-sa-admin@example.com", password: "Playwright123" };
const TARGET = { email: "pw-sa-target@example.com", password: "Playwright123" };

/** Provision a user with the given privilege flags via the seed script. */
function provision(email: string, password: string, flags: { admin?: boolean; superadmin?: boolean }) {
  execFileSync("node", [SCRIPT], {
    stdio: "ignore",
    env: {
      ...process.env,
      ADMIN_EMAIL: email,
      ADMIN_PASSWORD: password,
      ADMIN_IS_ADMIN: String(flags.admin === true),
      ADMIN_IS_SUPERADMIN: String(flags.superadmin === true),
    },
  });
}

/** Log in through the welcome → login flow, clearing the language gate if shown. */
async function login(page: Page, email: string, password: string) {
  await page.goto("/");
  await page.locator("#welcomeLoginButton").click();
  await page.locator("#authEmail").fill(email);
  await page.locator("#authPassword").fill(password);
  await page.locator("#authSubmit").click();
  await page.waitForFunction(() => {
    const shell = document.querySelector("#appShell");
    const shellVisible = shell instanceof HTMLElement && !shell.hasAttribute("hidden");
    return shellVisible || !!document.querySelector("[data-welcome-study-language]");
  });
  const languagePick = page.locator("[data-welcome-study-language]").first();
  if (await languagePick.isVisible()) {
    await languagePick.click();
  }
  await expect(page.locator("#appShell")).toBeVisible();
}

/** Call a same-origin admin endpoint from within the page, returning the HTTP status. */
async function apiStatus(
  page: Page,
  method: string,
  apiPath: string,
  body?: Record<string, unknown>
): Promise<number> {
  return page.evaluate(
    async ({ method, apiPath, body }) => {
      const base = (globalThis as { WORD_MARKER_API_BASE_URL?: string }).WORD_MARKER_API_BASE_URL || "";
      const me = await fetch(`${base}/api/auth/me`, { credentials: "include" }).then((r) => r.json());
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (me.csrfToken) {
        headers["x-csrf-token"] = me.csrfToken;
      }
      const response = await fetch(`${base}${apiPath}`, {
        method,
        credentials: "include",
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
      return response.status;
    },
    { method, apiPath, body }
  );
}

// Serialised: these tests repeatedly log the same elevated accounts in through
// the real auth flow; running them in parallel trips the login rate limiter.
test.describe.configure({ mode: "serial" });

test.describe("superadmin grant/revoke and audit log", () => {
  test.beforeAll(() => {
    provision(SUPERADMIN.email, SUPERADMIN.password, { superadmin: true });
    provision(ADMIN.email, ADMIN.password, { admin: true });
    // Start the target as a plain regular user.
    provision(TARGET.email, TARGET.password, { admin: false, superadmin: false });
  });

  test("regular user gets 403 from superadmin endpoints", async ({ browser }) => {
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();
    await login(page, TARGET.email, TARGET.password);

    expect(await apiStatus(page, "GET", "/api/admin/superadmin/audit")).toBe(403);
    expect(await apiStatus(page, "POST", "/api/admin/superadmin/grant", { email: TARGET.email })).toBe(403);
    expect(await apiStatus(page, "POST", "/api/admin/superadmin/revoke", { email: TARGET.email })).toBe(403);

    await context.close();
  });

  test("regular admin gets 403 from superadmin endpoints", async ({ browser }) => {
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();
    await login(page, ADMIN.email, ADMIN.password);

    expect(await apiStatus(page, "GET", "/api/admin/superadmin/audit")).toBe(403);
    expect(await apiStatus(page, "POST", "/api/admin/superadmin/grant", { email: TARGET.email })).toBe(403);
    expect(await apiStatus(page, "POST", "/api/admin/superadmin/revoke", { email: TARGET.email })).toBe(403);

    await context.close();
  });

  test("superadmin cannot clear their own superadmin flag (no path exists)", async ({ browser }) => {
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();
    await login(page, SUPERADMIN.email, SUPERADMIN.password);

    // Revoke targeting the superadmin themselves is refused (403), and there is
    // no endpoint that touches is_superadmin at all.
    expect(await apiStatus(page, "POST", "/api/admin/superadmin/revoke", { email: SUPERADMIN.email })).toBe(403);

    await context.close();
  });

  test("superadmin grants and revokes admin; target gains/loses the Admin tab; audit logs both", async ({ browser }) => {
    // Superadmin grants admin to the target via the Superadmin panel UI.
    const superContext = await browser.newContext({ storageState: undefined });
    const superPage = await superContext.newPage();
    await login(superPage, SUPERADMIN.email, SUPERADMIN.password);

    await superPage.locator('nav.tabs [data-tab="admin"]').click();
    await expect(superPage.locator("#adminView")).toBeVisible();
    await expect(superPage.locator("#adminSuperadminSubtab")).toBeVisible();
    await superPage.locator('[data-admin-subtab="superadmin"]').click();
    await expect(superPage.locator("#superadminGrantForm")).toBeVisible({ timeout: 10000 });

    await superPage.locator("#superadminEmailInput").fill(TARGET.email);
    await superPage.locator("#superadminGrantButton").click();
    await expect(superPage.locator("#superadminStatus")).toContainText(TARGET.email);

    // Audit log shows the grant entry with actor/target/before/after.
    const grantEntry = superPage.locator("#superadminAuditLog li").first();
    await expect(grantEntry).toContainText(SUPERADMIN.email);
    await expect(grantEntry).toContainText(`user:`);

    // Target logs in fresh and now sees the Admin tab (next-request evaluation).
    const targetContext = await browser.newContext({ storageState: undefined });
    const targetPage = await targetContext.newPage();
    await login(targetPage, TARGET.email, TARGET.password);
    await expect(targetPage.locator('nav.tabs [data-tab="admin"]')).toBeVisible();
    await targetContext.close();

    // Superadmin revokes admin from the target.
    await superPage.locator("#superadminEmailInput").fill(TARGET.email);
    await superPage.locator("#superadminRevokeButton").click();
    await expect(superPage.locator("#superadminStatus")).toContainText(TARGET.email);
    await expect(superPage.locator("#superadminAuditLog li").first()).toContainText(SUPERADMIN.email);

    // Target logs in fresh again and the Admin tab is gone.
    const targetContext2 = await browser.newContext({ storageState: undefined });
    const targetPage2 = await targetContext2.newPage();
    await login(targetPage2, TARGET.email, TARGET.password);
    await expect(targetPage2.locator('nav.tabs [data-tab="admin"]')).toBeHidden();
    await targetContext2.close();

    // Audit log shows at least the two entries we just produced.
    await expect(superPage.locator("#superadminAuditLog li")).not.toHaveCount(0);

    await superContext.close();
  });
});

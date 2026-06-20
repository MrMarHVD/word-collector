import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import path from "node:path";

/**
 * Behavioural smoke tests for the privilege-gated Admin tab (ADM-001).
 *
 * Covers the acceptance criteria around tab/subtab/rail visibility for the three
 * privilege tiers:
 *  - superadmin → Admin tab + Admin subtab + Superadmin subtab + Users/Words rail
 *  - admin      → Admin tab + Admin subtab + Users/Words rail, but NO Superadmin subtab
 *  - regular    → no Admin tab at all, and direct /admin navigation is redirected
 *
 * Elevated users are provisioned directly via provision_admin.js (the only way to
 * set the superadmin flag) and logged in through the real UI with a fresh context,
 * so they do not share the suite's regular-user storageState.
 */

const SCRIPT = path.resolve(process.cwd(), "backend/scripts/provision_admin.js");

const SUPERADMIN = { email: "pw-superadmin@example.com", password: "Playwright123" };
const ADMIN = { email: "pw-admin@example.com", password: "Playwright123" };
// The suite's default storageState belongs to this regular (non-admin) user; it
// is the editable target for the ADM-002 limit-override tests.
const REGULAR_EMAIL = process.env.PW_TEST_EMAIL ?? "playwright-test@example.com";

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

test.describe("admin tab privilege gating", () => {
  test.beforeAll(() => {
    provision(SUPERADMIN.email, SUPERADMIN.password, { superadmin: true });
    provision(ADMIN.email, ADMIN.password, { admin: true });
  });

  test("regular user sees no Admin tab and cannot reach /admin", async ({ page }) => {
    // The suite's default storageState is a regular (non-admin) user.
    await page.goto("/admin");
    await expect(page.locator('nav.tabs [data-tab="admin"]')).toBeHidden();
    // Direct navigation must not expose the admin view.
    await expect(page.locator("#adminView")).toBeHidden();
  });

  test("admin user sees Admin tab + rail but not the Superadmin subtab", async ({ browser }) => {
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();
    await login(page, ADMIN.email, ADMIN.password);

    await expect(page.locator('nav.tabs [data-tab="admin"]')).toBeVisible();
    await page.locator('nav.tabs [data-tab="admin"]').click();
    await expect(page.locator("#adminView")).toBeVisible();
    await expect(page.locator('[data-admin-subtab="admin"]')).toBeVisible();
    await expect(page.locator("#adminSuperadminSubtab")).toBeHidden();
    await expect(page.locator('[data-admin-rail="users"]')).toBeVisible();
    await expect(page.locator('[data-admin-rail="words"]')).toBeVisible();

    await context.close();
  });

  test("superadmin sees Admin tab, both subtabs, and the rail", async ({ browser }) => {
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();
    await login(page, SUPERADMIN.email, SUPERADMIN.password);

    await expect(page.locator('nav.tabs [data-tab="admin"]')).toBeVisible();
    await page.locator('nav.tabs [data-tab="admin"]').click();
    await expect(page.locator("#adminView")).toBeVisible();
    await expect(page.locator('[data-admin-subtab="admin"]')).toBeVisible();
    await expect(page.locator("#adminSuperadminSubtab")).toBeVisible();
    await expect(page.locator('[data-admin-rail="users"]')).toBeVisible();
    await expect(page.locator('[data-admin-rail="words"]')).toBeVisible();

    await context.close();
  });
});

/** Open the Admin → Users panel after logging in as the given user. */
async function openUsersPanel(page: Page) {
  await page.locator('nav.tabs [data-tab="admin"]').click();
  await expect(page.locator("#adminView")).toBeVisible();
  await page.locator('[data-admin-rail="users"]').click();
  await expect(page.locator("[data-admin-users-list]")).toBeVisible();
}

/**
 * Search for a user by email and return the (single) matching row, waiting for
 * the debounced server-side filter to settle so later interactions are not
 * clobbered by an in-flight list re-render.
 */
async function findRowByEmail(page: Page, email: string) {
  await page.locator("[data-admin-users-search]").fill(email);
  // The list reloads (debounced) and is replaced wholesale; wait until it has
  // narrowed to exactly the matching row before interacting with it.
  await expect(page.locator("[data-admin-users-list] > div")).toHaveCount(1);
  const row = page.locator("[data-admin-users-list] > div").first();
  await expect(row).toContainText(email);
  return row;
}

test.describe("admin users panel — limit overrides (ADM-002)", () => {
  test.beforeAll(() => {
    provision(SUPERADMIN.email, SUPERADMIN.password, { superadmin: true });
    provision(ADMIN.email, ADMIN.password, { admin: true });
  });

  test("lists users alphabetically by default and email search narrows the list", async ({ browser }) => {
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();
    await login(page, SUPERADMIN.email, SUPERADMIN.password);
    await openUsersPanel(page);

    // Default order is alphabetical by email (case-insensitive). Verify the
    // rendered email order is non-decreasing under locale collation (which the
    // DB also uses), so adjacent rows never go backwards.
    const emails = await page.locator("[data-admin-users-list] .truncate").allInnerTexts();
    expect(emails.length).toBeGreaterThan(0);
    for (let i = 1; i < emails.length; i += 1) {
      expect(emails[i - 1].toLowerCase().localeCompare(emails[i].toLowerCase())).toBeLessThanOrEqual(0);
    }

    // Searching for a specific email narrows the list to matching rows only.
    await page.locator("[data-admin-users-search]").fill(REGULAR_EMAIL);
    await expect(page.locator("[data-admin-users-list] > div")).toHaveCount(1);
    await expect(page.locator("[data-admin-users-list]")).toContainText(REGULAR_EMAIL);

    await context.close();
  });

  test("admin can set then clear a non-admin user's max-materials override", async ({ browser }) => {
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();
    await login(page, ADMIN.email, ADMIN.password);
    await openUsersPanel(page);
    const row = await findRowByEmail(page, REGULAR_EMAIL);

    // Set an override and confirm the effective max-documents reflects it.
    await row.locator("[data-limit-materials]").fill("3");
    await row.locator('button[type="submit"]').click();
    await expect(page.locator("[data-admin-users-list]")).toContainText("Max documents: 3");
    await expect(row.locator("[data-limit-materials]")).toHaveValue("3");

    // Clearing reverts the row to the global default (10).
    await row.locator("[data-admin-user-clear]").click();
    await expect(page.locator("[data-admin-users-list]")).toContainText("Max documents: 10");
    await expect(row.locator("[data-limit-materials]")).toHaveValue("");

    await context.close();
  });

  test("regular admin's controls are disabled on admin rows and the API rejects admin/self edits with 403", async ({ browser }) => {
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();
    await login(page, ADMIN.email, ADMIN.password);
    await openUsersPanel(page);

    // The admin's own row (an admin row) must have disabled edit controls.
    const ownRow = await findRowByEmail(page, ADMIN.email);
    await expect(ownRow.locator("[data-limit-materials]")).toBeDisabled();
    await expect(ownRow.locator('button[type="submit"]')).toBeDisabled();

    // A direct API call to edit an admin row is rejected with 403, regardless of UI.
    const status = await page.evaluate(async (email) => {
      const base = (window as unknown as { WORD_MARKER_API_BASE_URL?: string }).WORD_MARKER_API_BASE_URL || "";
      const csrf = await fetch(`${base}/api/auth/me`, { credentials: "include" }).then((r) => r.json());
      const list = await fetch(`${base}/api/admin/users?search=${encodeURIComponent(email)}`, { credentials: "include" }).then((r) => r.json());
      const target = list.users.find((u: { email: string }) => u.email === email);
      const res = await fetch(`${base}/api/admin/users/${target.id}/limits`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json", "x-csrf-token": csrf.csrfToken },
        body: JSON.stringify({ maxMaterials: 5, maxUploadBytes: null }),
      });
      return res.status;
    }, ADMIN.email);
    expect(status).toBe(403);

    await context.close();
  });

  test("superadmin can edit an admin user and the change is honoured", async ({ browser }) => {
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();
    await login(page, SUPERADMIN.email, SUPERADMIN.password);
    await openUsersPanel(page);
    const row = await findRowByEmail(page, ADMIN.email);

    // Superadmin may edit an admin row; controls are enabled and the edit sticks.
    await expect(row.locator("[data-limit-materials]")).toBeEnabled();
    await row.locator("[data-limit-materials]").fill("7");
    await row.locator('button[type="submit"]').click();
    await expect(page.locator("[data-admin-users-list]")).toContainText("Max documents: 7");

    // Clean up so the admin row returns to defaults for other runs.
    await row.locator("[data-admin-user-clear]").click();
    await expect(page.locator("[data-admin-users-list]")).toContainText("Max documents: 10");

    await context.close();
  });
});

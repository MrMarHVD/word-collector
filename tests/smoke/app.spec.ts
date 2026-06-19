import { test, expect } from "@playwright/test";

/**
 * Behavioural smoke tests for the authenticated app shell and main views.
 * These run with the reused storageState session (see auth.setup.ts), so each
 * test starts already logged in. Assertions stay coarse-grained on purpose:
 * they confirm each view mounts and its key elements render without crashing,
 * which is what catches the bulk of regressions cheaply.
 *
 * To add deeper checks for a specific feature, prefer a new file under tests/smoke/.
 */

/** Fails the test if the page logged any console error during the run. */
function trackConsoleErrors(page: import("@playwright/test").Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));
  return errors;
}

test.describe("authenticated app shell", () => {
  test("loads the app shell logged in", async ({ page }) => {
    const errors = trackConsoleErrors(page);
    await page.goto("/");

    // Auth view must be gone; the main tab bar must be present.
    await expect(page.locator("#authView")).toBeHidden();
    await expect(page.locator(".tab-button").first()).toBeVisible();

    expect(errors, `console errors: ${errors.join("\n")}`).toEqual([]);
  });

  test("reader view mounts", async ({ page }) => {
    await page.goto("/reader");
    await expect(page.locator('nav.tabs [data-tab="reader"]')).toHaveClass(/is-active/);
    await expect(page.locator("#materialList")).toBeVisible();
  });

  test("collections (vocab) view mounts", async ({ page }) => {
    await page.goto("/vocab");
    await expect(page.locator('nav.tabs [data-tab="collections"]')).toHaveClass(/is-active/);
    await expect(page.locator("#collectionsList")).toBeVisible();
  });

  test("dashboard view mounts", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.locator('nav.tabs [data-tab="dashboard"]')).toHaveClass(/is-active/);
  });
});

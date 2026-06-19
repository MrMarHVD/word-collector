import { test as setup, expect } from "@playwright/test";
import { TEST_EMAIL, TEST_PASSWORD } from "./global-setup";

const AUTH_FILE = "tests/.auth/user.json";

/**
 * Logs in once through the real UI and persists the authenticated session to
 * storageState (the HttpOnly `word_collector_token` cookie + localStorage). All
 * other specs reuse this state and skip login. The app re-fetches its CSRF token
 * from /api/auth/me on boot, so only the cookie/localStorage need persisting.
 *
 * Flow: welcome screen → open login form → submit credentials. A freshly
 * provisioned user has no study language, so the app returns to the welcome view
 * with a language picker; we select the first option to reach the app shell.
 * That selection persists server-side, so subsequent runs go straight through.
 */
setup("authenticate", async ({ page }) => {
  await page.goto("/");

  // Welcome screen → reveal the login form.
  await page.locator("#welcomeLoginButton").click();

  await page.locator("#authEmail").fill(TEST_EMAIL);
  await page.locator("#authPassword").fill(TEST_PASSWORD);
  await page.locator("#authSubmit").click();

  // After login the user lands either on the app shell (study language already
  // set) or back on the welcome view's language gate (first run). Wait for
  // whichever appears, then clear the gate if present.
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
  await expect(page.locator(".tab-button").first()).toBeVisible();

  await page.context().storageState({ path: AUTH_FILE });
});

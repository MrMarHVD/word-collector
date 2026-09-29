import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import type pg from "pg";
import { createTempUser, deleteTempUser, EN, FRONTEND_URL, LOCALES, openPool, type TempUser } from "./support/temp-data";

/**
 * Behavioural smoke tests for the settings page.
 *
 * Covers the primary flows end to end: changing the native language, the UI
 * language and the theme, each surviving a reload, and deleting the account
 * through the danger zone, which only unlocks once the email is typed and
 * returns the user to the welcome screen.
 *
 * Runs as its own temporary user, because every flow changes that user's
 * settings and the last one deletes the account. The UI language and theme
 * live in this test's own browser context. If a test fails before the account
 * deletion, the account is removed through the API afterwards.
 */

const JA = LOCALES.ja;

let pool: pg.Pool;
const user: Partial<TempUser> = {};
let context: BrowserContext;
let page: Page;

/** Opens the settings page, keeping one browser context so the UI language and theme persist across tests. */
async function openSettings(browser: Browser) {
  if (!context) {
    context = await browser.newContext({ storageState: user.storageState, baseURL: FRONTEND_URL });
    page = await context.newPage();
  }
  await page.goto("/settings");
  await expect(page.locator("#settingsView")).toBeVisible();
}

test.describe("settings", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async ({ playwright }) => {
    pool = openPool();
    await createTempUser(playwright.request, user, "pw-settings");
  });

  test.afterAll(async () => {
    await context?.close();
    await deleteTempUser(user, pool);
    await pool.end();
  });

  test("UI language changes immediately and persists after a reload", async ({ browser }) => {
    await openSettings(browser);
    await page.locator("#localeSelect").selectOption("ja");
    await expect(page.locator("html")).toHaveAttribute("lang", "ja");
    await expect(page.locator('[data-settings-panel="system"]').getByRole("heading", { name: JA["settings.title"] })).toBeVisible();

    await page.reload();
    await expect(page.locator("#localeSelect")).toHaveValue("ja");
    await expect(page.locator("html")).toHaveAttribute("lang", "ja");
    await expect(page.locator('[data-settings-panel="system"]').getByRole("heading", { name: JA["settings.title"] })).toBeVisible();

    await page.locator("#localeSelect").selectOption("en");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator('[data-settings-panel="system"]').getByRole("heading", { name: EN["settings.title"] })).toBeVisible();
  });

  test("native language is saved and persists after a reload", async ({ browser }) => {
    await openSettings(browser);
    const select = page.locator("#nativeLanguageSelect");
    await expect(select).toHaveValue("English");
    await select.selectOption("Chinese");
    await page.locator("#settingsForm").getByRole("button", { name: EN["settings.save"], exact: true }).click();
    await expect(page.locator("#settingsStatus")).toHaveText(EN["settings.saved"]);

    await page.reload();
    await expect(page.locator("#nativeLanguageSelect")).toHaveValue("Chinese");
  });

  test("theme applies immediately and persists after a reload", async ({ browser }) => {
    await openSettings(browser);
    const html = page.locator("html");

    await page.locator('[data-theme-option="dark"]').click();
    await expect(page.locator('[data-theme-option="dark"]')).toHaveAttribute("aria-pressed", "true");
    await expect(html).toHaveAttribute("data-theme-preference", "dark");
    await expect(html).toHaveAttribute("data-theme", "dark");

    await page.reload();
    await expect(page.locator('[data-theme-option="dark"]')).toHaveAttribute("aria-pressed", "true");
    await expect(html).toHaveAttribute("data-theme", "dark");

    await page.locator('[data-theme-option="light"]').click();
    await expect(page.locator('[data-theme-option="light"]')).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator('[data-theme-option="dark"]')).toHaveAttribute("aria-pressed", "false");
    await expect(html).toHaveAttribute("data-theme", "light");
  });

  test("delete the account after typing the email", async ({ browser }) => {
    await openSettings(browser);
    await page.locator('[data-settings-tab="account"]').click();
    await expect(page.locator('[data-settings-panel="account"]')).toBeVisible();
    await expect(page.locator("#accountDetails")).toContainText(user.email!);

    await page.locator("#deleteAccountToggle").click();
    await expect(page.locator("#deleteAccountPanel")).toBeVisible();
    const confirmation = page.locator("#deleteAccountConfirmation");
    const submit = page.locator("#deleteAccountSubmit");
    await confirmation.fill("someone-else@example.com");
    await expect(submit).toBeDisabled();
    await confirmation.fill(user.email!);
    await expect(submit).toBeEnabled();

    page.once("dialog", (dialog) => dialog.accept());
    await submit.click();
    await expect(page.locator("#welcomeView")).toBeVisible();
    await expect(page.locator("#welcomeLoginButton")).toBeVisible();
    await expect.poll(async () => (await pool.query("SELECT 1 FROM users WHERE lower(email) = lower($1)", [user.email])).rowCount).toBe(0);
  });
});

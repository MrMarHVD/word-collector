import { test, expect, type Page } from "@playwright/test";
import type pg from "pg";
import { createTempUser, deleteTempUser, deleteUnusedWords, EN, FRONTEND_URL, openPool, type TempUser } from "./support/temp-data";

/**
 * Behavioural smoke tests for the Library and the Reader entry points (SPEC-004).
 *
 * Covers search and the default sort, category create/rename/reorder/delete
 * (a deleted category's works become Uncategorised), moving a work by drag and
 * by the keyboard-reachable "Move to category" menu, the /reader/:id deep link
 * and the /reader redirect, the "Aa" settings panel, leaving the Reader for
 * the Library, and the dashboard go-to.
 *
 * Runs as its own temporary user with three small works, so counts and order
 * are deterministic and the shared storageState user is never touched. The
 * user is removed through account deletion afterwards, and only the words the
 * works' imports added are deleted.
 */

const STAMP = Date.now();
const WORKS = ["Alpha", "Beta", "Gamma"].map((name) => `pw-library-${STAMP}-${name}`);
const [ALPHA, BETA, GAMMA] = WORKS;
const SAMPLE_TEXT = "私は毎日学校に行きます。今日はとても良い天気です。友達と一緒に公園で遊びました。";

const user: Partial<TempUser> = {};
let pool: pg.Pool;
let maxWordIdBefore: number;
const materialIds: Record<string, number> = {};

/** Sends a CSRF-protected API request as the temporary user. */
function headers() {
  return { "x-csrf-token": user.csrfToken! };
}

/** Creates a category through the API and returns its id. */
async function createCategory(name: string): Promise<number> {
  const response = await user.api!.post("/api/categories", { headers: headers(), data: { languageId: user.languageId, name } });
  expect(response.status(), "category creation").toBe(201);
  return (await response.json()).category.id;
}

/** Puts a work into a category (or back to Uncategorised with null) through the API. */
async function assignCategory(title: string, categoryId: number | null) {
  const response = await user.api!.patch(`/api/materials/${materialIds[title]}`, { headers: headers(), data: { categoryId } });
  expect(response.ok(), "category assignment").toBe(true);
}

/** Opens a page signed in as the temporary user, in English. */
async function newPage(browser: import("@playwright/test").Browser, viewport?: { width: number; height: number }) {
  const context = await browser.newContext({ storageState: user.storageState, baseURL: FRONTEND_URL, ...(viewport ? { viewport } : {}) });
  await context.addInitScript(() => localStorage.setItem("wordMarkerLocale", "en"));
  return { context, page: await context.newPage() };
}

/** The row of a work in the Library list. */
function row(page: Page, title: string) {
  return page.locator("#materialList .material-row", { has: page.locator(`[data-material-id="${materialIds[title]}"]`) });
}

/** Titles of the works the Library lists, in order. */
async function listedTitles(page: Page): Promise<string[]> {
  return page.locator("#materialList .library-title-button").allTextContents();
}

/** The sidebar item of a category (or "all" / "uncategorised"). */
function categoryItem(page: Page, category: string | number) {
  return page.locator(`#libraryCategories [data-category="${category}"]`);
}

test.describe("library and reader", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async ({ playwright }) => {
    test.setTimeout(150_000);
    pool = openPool();
    await createTempUser(playwright.request, user, "pw-library");
    maxWordIdBefore = (await pool.query("SELECT COALESCE(MAX(id), 0) AS max FROM words WHERE language_id = $1", [user.languageId])).rows[0].max;
    // One at a time: concurrent imports of works sharing new words can fail.
    for (const title of WORKS) {
      const upload = await user.api!.post("/api/materials", {
        headers: headers(),
        multipart: { languageId: String(user.languageId), file: { name: `${title}.txt`, mimeType: "text/plain", buffer: Buffer.from(SAMPLE_TEXT, "utf8") } }
      });
      expect(upload.status(), "material upload").toBe(201);
      const id: number = (await upload.json()).material.id;
      materialIds[title] = id;
      await expect
        .poll(
          async () => {
            const payload = await (await user.api!.get(`/api/materials?languageId=${user.languageId}`)).json();
            const entry = payload.materials.find((m: { id: number }) => m.id === id);
            return entry?.importStatus === "ready" && entry?.translationStatus?.ready === true;
          },
          { timeout: 60_000, intervals: [500] }
        )
        .toBe(true);
    }
  });

  test.afterAll(async () => {
    const wordIds = Object.keys(materialIds).length
      ? (await pool.query("SELECT DISTINCT word_id FROM material_tokens WHERE material_id = ANY($1::int[]) AND word_id > $2", [Object.values(materialIds), maxWordIdBefore])).rows.map((r) => r.word_id)
      : [];
    await deleteTempUser(user, pool);
    await deleteUnusedWords(pool, { ids: wordIds });
    await pool.end();
  });

  test("lists works newest first until one is opened, which moves it to the top; search filters live", async ({ browser }) => {
    const { context, page } = await newPage(browser);
    await page.goto("/library");
    await expect(row(page, GAMMA)).toBeVisible();
    // Never opened: ordered by date added, newest first.
    expect(await listedTitles(page)).toEqual([GAMMA, BETA, ALPHA]);

    // Opening a work in the Reader records it, so it leads the list afterwards.
    const opened = await user.api!.post(`/api/materials/${materialIds[ALPHA]}/opened`, { headers: headers() });
    expect(opened.ok(), "mark opened").toBe(true);
    await page.reload();
    await expect(row(page, ALPHA)).toBeVisible();
    expect(await listedTitles(page)).toEqual([ALPHA, GAMMA, BETA]);

    // Search narrows the list as the user types; a miss shows the no-results state.
    await page.locator("#materialSearch").fill("Beta");
    await expect(page.locator("#materialList .material-row")).toHaveCount(1);
    await expect(row(page, BETA)).toBeVisible();
    await page.locator("#materialSearch").fill("zzz-no-such-work");
    await expect(page.locator("#materialList .material-row")).toHaveCount(0);
    await expect(page.locator("#materialList .empty")).toHaveText(EN["reader.noSearchMatches"]);
    await context.close();
  });

  test("categories: create, rename, reorder and delete, which moves its works to Uncategorised", async ({ browser }) => {
    const { context, page } = await newPage(browser);
    await page.goto("/library");
    await expect(categoryItem(page, "all")).toBeVisible();
    await expect(categoryItem(page, "uncategorised")).toBeVisible();

    // Create two categories from the sidebar.
    for (const name of ["pw-first", "pw-second"]) {
      await page.getByRole("button", { name: EN["library.categories.new"] }).click();
      await page.getByRole("textbox", { name: EN["library.categories.nameLabel"] }).fill(name);
      await page.keyboard.press("Enter");
      await expect(page.locator("#libraryCategories [data-category]", { hasText: name })).toBeVisible();
    }
    const categories = (await (await user.api!.get(`/api/categories?languageId=${user.languageId}`)).json()).categories as { id: number; name: string }[];
    const first = categories.find((c) => c.name === "pw-first")!;
    const second = categories.find((c) => c.name === "pw-second")!;

    // Rename the first.
    await categoryItem(page, first.id).getByRole("button", { name: fillName(EN["library.categories.actions"], "pw-first") }).click();
    await page.getByRole("menuitem", { name: EN["common.rename"] }).click();
    await page.getByRole("textbox", { name: EN["library.categories.nameLabel"] }).fill("pw-renamed");
    await page.keyboard.press("Enter");
    await expect(categoryItem(page, first.id)).toContainText("pw-renamed");

    // Reorder: move the first one down, and the order persists on the server.
    await categoryItem(page, first.id).getByRole("button", { name: fillName(EN["library.categories.actions"], "pw-renamed") }).click();
    await page.getByRole("menuitem", { name: EN["library.categories.moveDown"] }).click();
    await expect
      .poll(async () => ((await (await user.api!.get(`/api/categories?languageId=${user.languageId}`)).json()).categories as { id: number }[]).map((c) => c.id))
      .toEqual([second.id, first.id]);

    // Delete the second category: its work is not deleted, it becomes Uncategorised.
    await assignCategory(BETA, second.id);
    await page.reload();
    await categoryItem(page, second.id).click();
    await expect(row(page, BETA)).toBeVisible();
    await categoryItem(page, second.id).getByRole("button", { name: fillName(EN["library.categories.actions"], "pw-second") }).click();
    await page.getByRole("menuitem", { name: EN["common.delete"] }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: EN["common.delete"], exact: true }).click();
    await expect(categoryItem(page, second.id)).toHaveCount(0);
    await categoryItem(page, "uncategorised").click();
    await expect(row(page, BETA)).toBeVisible();

    // Clean up the remaining category so later tests start from a known state.
    const remove = await user.api!.delete(`/api/categories/${first.id}`, { headers: headers() });
    expect(remove.ok(), "category deletion").toBe(true);
    await context.close();
  });

  test("a work moves to a category by drag and by the Move to category menu", async ({ browser }) => {
    const target = await createCategory("pw-target");
    const { context, page } = await newPage(browser);
    await page.goto("/library");
    await expect(row(page, GAMMA)).toBeVisible();

    // Drag the row's card onto the category.
    await row(page, GAMMA).locator(".library-card").dragTo(categoryItem(page, target));
    await expect.poll(async () => (await (await user.api!.get(`/api/materials?languageId=${user.languageId}&category=${target}`)).json()).materials.map((m: { id: number }) => m.id)).toEqual([materialIds[GAMMA]]);
    await categoryItem(page, target).click();
    await expect(page.locator("#materialList .material-row")).toHaveCount(1);
    await expect(row(page, GAMMA)).toBeVisible();

    // Drop on Uncategorised removes the category again.
    await row(page, GAMMA).locator(".library-card").dragTo(categoryItem(page, "uncategorised"));
    await expect(page.locator("#materialList .empty")).toHaveText(EN["library.emptyCategory"]);

    // Keyboard: open the row menu from its button, then pick the category.
    await categoryItem(page, "all").click();
    const menuButton = page.locator(`[data-material-menu-id="${materialIds[BETA]}"]`);
    await menuButton.focus();
    await page.keyboard.press("Enter");
    await page.locator(`[data-move-material-id="${materialIds[BETA]}"]`).click();
    await page.locator(`[data-move-category="${target}"]`).click();
    await categoryItem(page, target).click();
    await expect(row(page, BETA)).toBeVisible();
    await expect(page.locator("#materialList .material-row")).toHaveCount(1);

    // Deleting the category through the API leaves the work Uncategorised.
    await user.api!.delete(`/api/categories/${target}`, { headers: headers() });
    await context.close();
  });

  test("/reader/:id deep link survives a reload, /reader reopens the last-read work, and exit returns to the Library", async ({ browser }) => {
    const { context, page } = await newPage(browser);
    await page.addInitScript(() => localStorage.setItem("wordMarkerReaderWordsPerPage", "50"));

    // Deep link and reload.
    await page.goto(`/reader/${materialIds[BETA]}`);
    await expect(page.locator("#readerTitle")).toHaveText(BETA);
    await expect(page.locator("#readerText .reader-token").first()).toBeVisible();
    await page.reload();
    await expect(page.locator("#readerTitle")).toHaveText(BETA);
    await expect(page.locator('nav.tabs [data-tab="reader"]')).toHaveClass(/is-active/);

    // /reader redirects to the last-opened work (BETA, opened just now).
    await expect.poll(async () => (await (await user.api!.get(`/api/materials?languageId=${user.languageId}`)).json()).materials[0].id).toBe(materialIds[BETA]);
    await page.goto("/reader");
    await expect(page).toHaveURL(new RegExp(`/reader/${materialIds[BETA]}$`));

    // Leaving through the exit button returns to the Library with its search intact.
    await page.goto("/library");
    await page.locator("#materialSearch").fill("Gamma");
    await expect(page.locator("#materialList .material-row")).toHaveCount(1);
    await page.locator(`[data-material-id="${materialIds[GAMMA]}"]`).click();
    await expect(page).toHaveURL(new RegExp(`/reader/${materialIds[GAMMA]}$`));
    await expect(page.locator("#readerTitle")).toHaveText(GAMMA);
    await page.locator("#readerFocusExit").click();
    await expect(page).toHaveURL(/\/library\?.*q=Gamma/);
    await expect(page.locator("#materialSearch")).toHaveValue("Gamma");

    // Escape with nothing else open leaves the Reader too.
    await page.locator(`[data-material-id="${materialIds[GAMMA]}"]`).click();
    await expect(page.locator("#readerText .reader-token").first()).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(/\/library/);
    await context.close();
  });

  test("the Aa panel opens, applies a setting live, and closes on Escape and on Aa", async ({ browser }) => {
    const { context, page } = await newPage(browser);
    await page.goto(`/reader/${materialIds[ALPHA]}`);
    await expect(page.locator("#readerText .reader-token").first()).toBeVisible();
    const panel = page.locator("[data-reader-settings]:not(button)");
    await expect(panel).toHaveCount(0);

    await page.locator("#readerSettingsButton").click();
    await expect(panel).toBeVisible();
    await expect(page.locator("#readerFontSize")).toBeVisible();

    // A change applies immediately and is stored.
    await panel.getByRole("slider").first().focus();
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => page.evaluate(() => localStorage.getItem("wordMarkerReaderFontSize"))).toBe("23");

    // Escape closes the panel and keeps the Reader open, with focus back on Aa.
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`/reader/${materialIds[ALPHA]}$`));
    await expect(page.locator("#readerSettingsButton")).toBeFocused();

    // The Aa button toggles it closed again.
    await page.locator("#readerSettingsButton").click();
    await expect(panel).toBeVisible();
    await page.locator("#readerSettingsButton").click();
    await expect(panel).toHaveCount(0);
    await context.close();
  });

  test("clicking a work's title on the dashboard shows it in the Library without opening it", async ({ browser }) => {
    const { context, page } = await newPage(browser);
    await page.goto("/dashboard");
    await page.locator('[data-dashboard-stats-tab="documents"]').click();
    await page.locator("[data-dashboard-document-link]", { hasText: ALPHA }).click();

    // The work is outlined in place under All, and the address drops the focus parameter.
    await expect(page).toHaveURL(/\/library(\?category=all)?$/);
    await expect(row(page, ALPHA)).toHaveClass(/is-focused/);
    await expect(page).not.toHaveURL(/focus=/);
    await expect(page.locator("#readerView")).toHaveCount(0);
    await context.close();
  });

  test("mobile: a work can be moved to a category by menu", async ({ browser }) => {
    const target = await createCategory("pw-mobile");
    const { context, page } = await newPage(browser, { width: 390, height: 844 });
    await page.goto("/library");
    await expect(row(page, ALPHA)).toBeVisible();
    await page.locator(`[data-material-menu-id="${materialIds[ALPHA]}"]`).click();
    await page.locator(`[data-move-material-id="${materialIds[ALPHA]}"]`).click();
    await page.locator(`[data-move-category="${target}"]`).click();
    await expect.poll(async () => (await (await user.api!.get(`/api/materials?languageId=${user.languageId}&category=${target}`)).json()).materials.length).toBe(1);
    await user.api!.delete(`/api/categories/${target}`, { headers: headers() });
    await context.close();
  });
});

/** Fills the `{name}` placeholder of a localised template. */
function fillName(template: string, name: string): string {
  return template.replace("{name}", name);
}

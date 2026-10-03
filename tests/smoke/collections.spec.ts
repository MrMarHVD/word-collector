import { test, expect, type Locator, type Page } from "@playwright/test";
import type pg from "pg";
import { TEST_EMAIL } from "../global-setup";
import { deleteUnusedWords, EN, FRONTEND_URL, openPool, SHARED_USER_STATE, sharedUserApi, type ApiSession } from "./support/temp-data";

/**
 * Behavioural smoke tests for the vocabulary (collections) tab.
 *
 * Covers the primary flows end to end: creating collections by CSV upload,
 * uploading into an existing collection, switching collections, searching,
 * editing a translation, marking words (one, and several at once through
 * row selection), moving a word to another collection by drag and drop,
 * deleting a word, and the changes persisting after a reload. A 390x844 run
 * switches collections through the mobile dropdown. The current app has no
 * UI to rename or delete a collection, so those are not covered.
 *
 * Runs as the shared storageState user: it changes no settings and only
 * touches its own collections and words, which carry a unique prefix. The
 * collections are removed through the API afterwards, and the global words
 * the uploads created are deleted once nothing references them.
 */

const STAMP = Date.now();
const WORD_PREFIX = `pw-col-${STAMP}-`;
const COLLECTION_A = `PW collections ${STAMP} A`;
const COLLECTION_B = `PW collections ${STAMP} B`;
const word = (suffix: string) => `${WORD_PREFIX}${suffix}`;

let pool: pg.Pool;
let shared: ApiSession;

/** Builds an in-memory CSV upload from `[word suffix, translation]` rows. */
function csv(rows: [string, string][]) {
  return {
    name: `pw-collections-${STAMP}.csv`,
    mimeType: "text/csv",
    buffer: Buffer.from(rows.map(([suffix, translation]) => `${word(suffix)},${translation}`).join("\n"), "utf8")
  };
}

/** Opens the vocabulary tab in English. */
async function openVocab(page: Page) {
  await page.goto("/vocab");
  await page.locator("#localeSelect").selectOption("en");
  await expect(page.locator('nav.tabs [data-tab="collections"]')).toHaveClass(/is-active/);
}

function collectionButton(page: Page, name: string) {
  return page.locator("#collectionsList .collection-button", { hasText: name });
}

function rows(page: Page) {
  return page.locator("#wordRows .word-row");
}

function row(page: Page, suffix: string) {
  return rows(page).filter({ has: page.locator(".word-cell-main", { hasText: word(suffix) }) });
}

/** Drags one element onto another with real mouse input, as a user would. */
async function dragWithMouse(page: Page, source: Locator, target: Locator) {
  await source.hover();
  await page.mouse.down();
  const box = await target.boundingBox();
  if (!box) {
    throw new Error("drop target is not visible");
  }
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 10 });
  await page.mouse.up();
}

/** Uploads a CSV through the upload modal, into a new or an existing collection. */
async function upload(page: Page, target: { newCollection: string } | { existingCollection: string }, file: ReturnType<typeof csv>) {
  await page.locator("#uploadOpenButton").click();
  const modal = page.locator("#uploadModal");
  await expect(modal).toBeVisible();
  if ("newCollection" in target) {
    await page.locator("#uploadTargetNewButton").click();
    await page.locator("#collectionName").fill(target.newCollection);
  } else {
    await page.locator("#uploadTargetExistingButton").click();
    await page.locator("#uploadCollectionSelect").selectOption({ label: target.existingCollection });
  }
  await page.locator("#csvFile").setInputFiles(file);
  await modal.getByRole("button", { name: EN["upload.button"], exact: true }).click();
  await expect(modal).toBeHidden();
}

test.describe("collections", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async ({ playwright }) => {
    pool = openPool();
    shared = await sharedUserApi(playwright.request);
  });

  test.afterAll(async () => {
    const created = await pool.query(
      "SELECT c.id FROM collections c JOIN users u ON u.id = c.user_id WHERE lower(u.email) = lower($1) AND c.name LIKE $2",
      [TEST_EMAIL, `PW collections ${STAMP} %`]
    );
    for (const { id } of created.rows) {
      const deletion = await shared.api.delete(`/api/collections/${id}`, { headers: { "x-csrf-token": shared.csrfToken } });
      expect(deletion.status(), "temporary collection deletion").toBe(200);
    }
    await deleteUnusedWords(pool, { like: `${WORD_PREFIX}%` });
    await shared.api.dispose();
    await pool.end();
  });

  test("create collections by CSV upload, into a new and an existing collection", async ({ page }) => {
    await openVocab(page);

    await upload(page, { newCollection: COLLECTION_A }, csv([["w1", "one"], ["w2", "two"], ["w3", "three"]]));
    await expect(collectionButton(page, COLLECTION_A)).toHaveAttribute("aria-pressed", "true");
    await expect(rows(page)).toHaveCount(3);
    await expect(row(page, "w2").locator(".translation-override-text")).toHaveText("two");

    await upload(page, { existingCollection: COLLECTION_A }, csv([["w4", "four"]]));
    await expect(collectionButton(page, COLLECTION_A)).toHaveAttribute("aria-pressed", "true");
    await expect(rows(page)).toHaveCount(4);

    await upload(page, { newCollection: COLLECTION_B }, csv([["w5", "five"]]));
    await expect(collectionButton(page, COLLECTION_B)).toHaveAttribute("aria-pressed", "true");
    await expect(rows(page)).toHaveCount(1);
  });

  test("search, edit, mark, move and delete words", async ({ page }) => {
    await openVocab(page);
    await collectionButton(page, COLLECTION_A).click();
    await expect(collectionButton(page, COLLECTION_A)).toHaveAttribute("aria-pressed", "true");
    await expect(rows(page)).toHaveCount(4);

    // Search narrows the list and clearing it restores the collection.
    await page.locator("#searchInput").fill(word("w2"));
    await expect(rows(page)).toHaveCount(1);
    await expect(row(page, "w2")).toBeVisible();
    await page.locator("#searchInput").fill("");
    await expect(rows(page)).toHaveCount(4);

    // Edit a translation.
    await row(page, "w1").locator("[data-translation-override-edit]").click();
    await row(page, "w1").getByRole("textbox", { name: EN["translation.overrideInput"] }).fill("edited one");
    await row(page, "w1").getByRole("button", { name: EN["translation.save"], exact: true }).click();
    await expect(row(page, "w1").locator(".translation-override-text")).toHaveText("edited one");

    // Mark one word as known.
    await row(page, "w1").locator('.status-toggle [data-status="known"]').click();
    await expect(row(page, "w1").locator('.status-toggle [data-status="known"]')).toHaveAttribute("aria-checked", "true");

    // Select two rows and mark both as learning in one go.
    await row(page, "w2").locator(".word-cell-main").click();
    await row(page, "w3").locator(".word-cell-main").click({ modifiers: ["ControlOrMeta"] });
    await expect(row(page, "w2")).toHaveAttribute("aria-selected", "true");
    await expect(row(page, "w3")).toHaveAttribute("aria-selected", "true");
    await row(page, "w2").locator('.status-toggle [data-status="learning"]').click();
    await expect(row(page, "w2").locator('.status-toggle [data-status="learning"]')).toHaveAttribute("aria-checked", "true");
    await expect(row(page, "w3").locator('.status-toggle [data-status="learning"]')).toHaveAttribute("aria-checked", "true");
    await expect(row(page, "w4").locator('.status-toggle [data-status="learning"]')).toHaveAttribute("aria-checked", "false");

    // Drag a selected word onto another collection to move it there.
    await row(page, "w4").locator(".word-cell-main").click();
    await expect(row(page, "w4")).toHaveAttribute("aria-selected", "true");
    await dragWithMouse(page, row(page, "w4").locator(".word-drag-handle"), collectionButton(page, COLLECTION_B));
    await expect(rows(page)).toHaveCount(3);
    await expect(row(page, "w4")).toHaveCount(0);
    await collectionButton(page, COLLECTION_B).click();
    await expect(rows(page)).toHaveCount(2);
    await expect(row(page, "w4")).toBeVisible();

    // Delete the selected word after confirming.
    await row(page, "w5").locator(".word-cell-main").click();
    await expect(page.locator("#deleteSelectedButton")).toBeEnabled();
    await page.locator("#deleteSelectedButton").click();
    await page.getByRole("alertdialog").getByRole("button", { name: EN["common.delete"], exact: true }).click();
    await expect(rows(page)).toHaveCount(1);
    await expect(row(page, "w5")).toHaveCount(0);

    // Everything persists across a reload.
    await page.reload();
    await page.locator("#localeSelect").selectOption("en");
    await collectionButton(page, COLLECTION_A).click();
    await expect(rows(page)).toHaveCount(3);
    await expect(row(page, "w1").locator(".translation-override-text")).toHaveText("edited one");
    await expect(row(page, "w1").locator('.status-toggle [data-status="known"]')).toHaveAttribute("aria-checked", "true");
    await expect(row(page, "w3").locator('.status-toggle [data-status="learning"]')).toHaveAttribute("aria-checked", "true");
    await collectionButton(page, COLLECTION_B).click();
    await expect(rows(page)).toHaveCount(1);
    await expect(row(page, "w4")).toBeVisible();
  });

  test("mobile: switch collections with the dropdown", async ({ browser }) => {
    const context = await browser.newContext({ storageState: SHARED_USER_STATE, baseURL: FRONTEND_URL, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    try {
      const page = await context.newPage();
      await openVocab(page);
      const select = page.locator("#collectionsSelect");
      await expect(select).toBeVisible();
      await select.selectOption({ label: COLLECTION_A });
      await expect(rows(page)).toHaveCount(3);
      await select.selectOption({ label: COLLECTION_B });
      await expect(rows(page)).toHaveCount(1);
      await expect(row(page, "w4")).toBeVisible();
    } finally {
      await context.close();
    }
  });
});

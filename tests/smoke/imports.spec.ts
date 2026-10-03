import { test, expect, type Locator, type Page } from "@playwright/test";
import JSZip from "jszip";
import type pg from "pg";
import { TEST_EMAIL } from "../global-setup";
import { deleteUnusedWords, EN, fill, openPool, sharedUserApi, type ApiSession } from "./support/temp-data";

/**
 * Behavioural smoke tests for importing reader works.
 *
 * For each supported file type (TXT, EPUB and PDF, built in memory as small
 * fixtures) a work is imported through the reader's import dialog, and the
 * test checks that it is listed with its type, that it opens in the reader
 * once processed, that it opens again from the document list, and that it
 * can be deleted from the list.
 *
 * Runs as the shared storageState user: it changes no settings and only
 * touches its own works, whose titles carry a unique prefix. Afterwards, works
 * left behind by a failed run are deleted, then the words the imports added to
 * the user's word list (and the reader collection holding them, when the run
 * created it) are removed through the API, and the global words the imports
 * created are deleted once nothing references them.
 */

const STAMP = Date.now();
const TITLE_PREFIX = `pw-import-${STAMP}`;
const SENTENCES = "私は毎日学校に行きます。今日はとても良い天気です。友達と一緒に公園で遊びました。";

let pool: pg.Pool;
let shared: ApiSession;
let sharedUserId: number;
let maxWordIdBefore: number;
let listedWordIdsBefore: Set<number>;
let collectionIdsBefore: Set<number>;
/** Words an imported work references, collected before it is deleted. */
const importedWordIds = new Set<number>();

/** Builds a minimal EPUB 3 archive with one chapter. */
async function epubBuffer(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file("META-INF/container.xml", `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`);
  zip.file("OEBPS/content.opf", `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">${TITLE_PREFIX}</dc:identifier><dc:title>${TITLE_PREFIX}</dc:title><dc:language>ja</dc:language></metadata>
  <manifest><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest>
  <spine><itemref idref="chapter"/></spine>
</package>`);
  zip.file("OEBPS/chapter.xhtml", `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>${TITLE_PREFIX}</title></head><body><p>${SENTENCES}</p></body></html>`);
  return zip.generateAsync({ type: "nodebuffer" });
}

/** Builds a minimal one-page PDF with a line of Latin text (the standard fonts carry no Japanese glyphs). */
function pdfBuffer(): Buffer {
  const stream = "BT /F1 18 Tf 72 720 Td (Watashi wa mainichi gakkou ni ikimasu.) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
  ];
  let body = "%PDF-1.4\n";
  const offsets = objects.map((object, index) => {
    const offset = body.length;
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
    return offset;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}

/** Remembers the words a work references, so what its import added can be removed with the test data. */
async function rememberImportedWords(materialId: number) {
  const result = await pool.query("SELECT DISTINCT word_id FROM material_tokens WHERE material_id = $1", [materialId]);
  result.rows.forEach((row) => importedWordIds.add(row.word_id));
}

/** Ids from the first column of a query result. */
async function ids(sql: string, params: unknown[]): Promise<number[]> {
  return (await pool.query(sql, params)).rows.map((row) => Object.values(row)[0] as number);
}

/**
 * Removes what the imports added to the shared user's word list: those words,
 * then any collection this run created that they leave empty.
 */
async function removeAddedListWords() {
  const added = [...importedWordIds].filter((id) => !listedWordIdsBefore.has(id));
  if (!added.length) {
    return;
  }
  const collections = await ids("SELECT DISTINCT collection_id FROM user_words WHERE user_id = $1 AND word_id = ANY($2::int[])", [sharedUserId, added]);
  const listed = await ids("SELECT word_id FROM user_words WHERE user_id = $1 AND word_id = ANY($2::int[])", [sharedUserId, added]);
  if (listed.length) {
    const deletion = await shared.api.post("/api/words/delete", { headers: { "x-csrf-token": shared.csrfToken }, data: { wordIds: listed } });
    expect(deletion.status(), "temporary word-list deletion").toBe(200);
  }
  for (const id of collections.filter((id) => !collectionIdsBefore.has(id))) {
    const remaining = await pool.query("SELECT 1 FROM user_words WHERE collection_id = $1 LIMIT 1", [id]);
    if (!remaining.rowCount) {
      const deletion = await shared.api.delete(`/api/collections/${id}`, { headers: { "x-csrf-token": shared.csrfToken } });
      expect(deletion.status(), "temporary collection deletion").toBe(200);
    }
  }
}

/** Shows the document list, which sits in the Library: an open reader is left through its exit button. */
async function showDocuments(page: Page) {
  if (!(await page.locator("#materialImportOpen").isVisible())) {
    await page.locator("#readerFocusExit").click();
  }
  await expect(page.locator("#materialImportOpen")).toBeVisible();
}

/** Opens a work from the document list and waits for its text in the reader. */
async function openFromList(page: Page, titleButton: Locator, title: string) {
  await showDocuments(page);
  await titleButton.click();
  await expect(page.locator("#readerTitle")).toHaveText(title);
  await expect(page.locator("#readerText .reader-token").first()).toBeVisible();
}

const FIXTURES = [
  { type: "txt", mimeType: "text/plain", build: async () => Buffer.from(SENTENCES.repeat(2), "utf8") },
  { type: "epub", mimeType: "application/epub+zip", build: epubBuffer },
  { type: "pdf", mimeType: "application/pdf", build: async () => pdfBuffer() }
];

test.describe("material imports", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async ({ playwright }) => {
    pool = openPool();
    shared = await sharedUserApi(playwright.request);
    sharedUserId = (await ids("SELECT id FROM users WHERE lower(email) = lower($1)", [TEST_EMAIL]))[0];
    maxWordIdBefore = (await pool.query("SELECT COALESCE(MAX(id), 0) AS max FROM words")).rows[0].max;
    listedWordIdsBefore = new Set(await ids("SELECT word_id FROM user_words WHERE user_id = $1", [sharedUserId]));
    collectionIdsBefore = new Set(await ids("SELECT id FROM collections WHERE user_id = $1", [sharedUserId]));
  });

  test.afterAll(async () => {
    const leftovers = await ids("SELECT id FROM materials WHERE user_id = $1 AND title LIKE $2", [sharedUserId, `${TITLE_PREFIX}-%`]);
    for (const id of leftovers) {
      await rememberImportedWords(id);
      const deletion = await shared.api.delete(`/api/materials/${id}`, { headers: { "x-csrf-token": shared.csrfToken } });
      expect(deletion.status(), "temporary material deletion").toBe(200);
    }
    await removeAddedListWords();
    await deleteUnusedWords(pool, { ids: [...importedWordIds].filter((id) => id > maxWordIdBefore) });
    await shared.api.dispose();
    await pool.end();
  });

  for (const fixture of FIXTURES) {
    test(`import a ${fixture.type.toUpperCase()} work, open it from the list and delete it`, async ({ page }) => {
      test.setTimeout(150_000);
      const title = `${TITLE_PREFIX}-${fixture.type}`;
      await page.goto("/library");
      await page.locator("#localeSelect").selectOption("en");
      await showDocuments(page);

      // Import through the dialog.
      await page.locator("#materialImportOpen").click();
      const modal = page.locator("#materialImportModal");
      await expect(modal).toBeVisible();
      await page.locator("#materialFile").setInputFiles({ name: `${title}.${fixture.type}`, mimeType: fixture.mimeType, buffer: await fixture.build() });
      const uploaded = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname === "/api/materials");
      await modal.getByRole("button", { name: EN["reader.importButton"], exact: true }).click();
      const response = await uploaded;
      expect(response.status(), "material upload").toBe(201);
      const materialId: number = (await response.json()).material.id;
      await expect(modal).toBeHidden();

      // It is listed, and opens in the reader once processed.
      const titleButton = page.locator(`#materialList [data-material-id="${materialId}"]`);
      await expect(titleButton).toHaveText(title);
      await expect(titleButton).toBeEnabled({ timeout: 120_000 });
      await rememberImportedWords(materialId);
      await openFromList(page, titleButton, title);

      // After a reload it is still listed with its file type and opens again.
      await page.reload();
      await showDocuments(page);
      await page.locator("#localeSelect").selectOption("en");
      const listRow = page.locator("#materialList .material-row", { has: page.locator(`[data-material-id="${materialId}"]`) });
      await expect(listRow).toContainText(fill(EN["reader.materialMeta"].split("{words}")[0], { type: fixture.type.toUpperCase() }));
      await openFromList(page, titleButton, title);

      // Delete it from the list after confirming.
      await showDocuments(page);
      await page.locator(`#materialList [data-material-menu-id="${materialId}"]`).click();
      await page.locator(`[data-delete-material-id="${materialId}"]`).click();
      await page.getByRole("alertdialog").getByRole("button", { name: EN["common.delete"], exact: true }).click();
      await expect(titleButton).toHaveCount(0);
      await expect(page).toHaveURL(/\/library$/);
    });
  }
});

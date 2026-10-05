import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { createTempUser, deleteTempUser, deleteUnusedWords, FRONTEND_URL, openPool, type TempUser } from "./support/temp-data";

/**
 * Behavioural smoke tests for Chinese reader sentence translation (SPEC-002).
 *
 * For a Simplified Chinese material read by an English native, drag-selecting
 * words opens the translation popup with the exact source text (no injected
 * spaces) and an English translation, and the radial quick menu does not
 * appear. With a non-English native language the quick menu is kept. Runs as
 * its own temporary user, enrolled in Chinese, which is removed afterwards
 * together with the words its import added. Skipped, before anything is
 * created, when the Chinese model files are absent (they are gitignored).
 */

const MODEL_URL = "/models/zh-en-2.1/model.bin";
const SENTENCES = ["我每天去学校。", "今天天气很好。", "我和朋友一起在公园里玩。", "明天可能会下雨。", "妈妈正在厨房里做饭。", "这本书非常有意思。"];
const SAMPLE_TEXT = Array.from({ length: 4 }, () => SENTENCES.join("")).join("\n\n");

const user: Partial<TempUser> = {};
const openContexts: BrowserContext[] = [];
let pool: ReturnType<typeof openPool> | null = null;
let languageId = 0;
let materialId = 0;
let maxWordIdBefore = 0;

async function patchNativeLanguage(nativeLanguage: string) {
  const response = await user.api!.patch("/api/settings", { headers: { "x-csrf-token": user.csrfToken! }, data: { nativeLanguage } });
  expect(response.ok()).toBe(true);
}

/** Polls the material list until the upload is imported and translated for the current native language. */
async function waitForMaterialReady() {
  await expect
    .poll(
      async () => {
        const payload = await (await user.api!.get(`/api/materials?languageId=${languageId}`)).json();
        const material = payload.materials.find((entry: { id: number }) => entry.id === materialId);
        return material?.importStatus === "ready" && material?.translationStatus?.ready === true;
      },
      { timeout: 90_000, intervals: [1_000] }
    )
    .toBe(true);
}

/** Opens the sample material in the reader, in English, recording every selection's source text. */
async function openReader(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ storageState: user.storageState, baseURL: FRONTEND_URL });
  openContexts.push(context);
  const page = await context.newPage();
  await page.addInitScript(() => {
    localStorage.setItem("wordMarkerLocale", "en");
    localStorage.setItem("wordMarkerStudyLanguageName", "Chinese");
    localStorage.setItem("wordMarkerReaderWordsPerPage", "50");
    const w = window as unknown as { __segments: string[] };
    w.__segments = [];
    document.addEventListener("reader:segment-selected", (event) => w.__segments.push((event as CustomEvent).detail.sourceText));
  });
  await page.goto("/library");
  const materialButton = page.locator(`[data-material-id="${materialId}"]`);
  await materialButton.waitFor({ state: "attached" });
  await materialButton.click();
  await expect(page).toHaveURL(new RegExp(`/reader/${materialId}$`));
  await expect(tokens(page).first()).toBeVisible();
  await page.waitForLoadState("networkidle");
  return page;
}

function tokens(page: Page) {
  return page.locator("#readerText .reader-token[data-token-id]");
}

async function tokenCenter(page: Page, index: number) {
  const box = await tokens(page).nth(index).boundingBox();
  if (!box) {
    throw new Error(`token ${index} is not visible`);
  }
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function mouseSelect(page: Page, from: number, to: number) {
  const start = await tokenCenter(page, from);
  const end = await tokenCenter(page, to);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await page.mouse.up();
}

test.describe("reader sentence translation (Chinese)", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async ({ playwright }) => {
    const probe = await playwright.request.newContext();
    const modelStatus = (await probe.head(`${FRONTEND_URL}${MODEL_URL}`)).status();
    await probe.dispose();
    test.skip(modelStatus === 404, "Chinese translation model files are not present.");

    pool = openPool();
    await createTempUser(playwright.request, user, "pw-translation-zh");
    const enrolment = await user.api!.post("/api/languages", { headers: { "x-csrf-token": user.csrfToken! }, data: { name: "Chinese" } });
    expect(enrolment.status()).toBe(201);
    languageId = (await enrolment.json()).language.id;
    // Words above this id that only this material references were added by its import.
    maxWordIdBefore = (await pool.query("SELECT COALESCE(MAX(id), 0) AS max FROM words WHERE language_id = $1", [languageId])).rows[0].max;
    const upload = await user.api!.post("/api/materials", {
      headers: { "x-csrf-token": user.csrfToken! },
      multipart: {
        languageId: String(languageId),
        file: { name: `pw-translation-zh-${Date.now()}.txt`, mimeType: "text/plain", buffer: Buffer.from(SAMPLE_TEXT, "utf8") }
      }
    });
    expect(upload.status()).toBe(201);
    materialId = (await upload.json()).material.id;
    await waitForMaterialReady();
  });

  test.afterEach(async () => {
    await Promise.all(openContexts.splice(0).map((context) => context.close()));
  });

  test.afterAll(async () => {
    // Nothing was created when the suite was skipped before provisioning.
    if (!pool) {
      return;
    }
    // Collect the material's words before account deletion removes its tokens.
    const wordIds = materialId
      ? (await pool.query("SELECT DISTINCT word_id FROM material_tokens WHERE material_id = $1 AND word_id > $2", [materialId, maxWordIdBefore])).rows.map((row) => row.word_id)
      : [];
    await deleteTempUser(user, pool);
    await deleteUnusedWords(pool, { ids: wordIds });
    await pool.end();
  });

  test("drag-select translates a Chinese sentence and replaces the quick menu", async ({ browser }) => {
    test.setTimeout(180_000);
    const page = await openReader(browser);
    const popup = page.locator("#readerTranslation");

    await mouseSelect(page, 0, 3);
    await expect(popup).toBeVisible();
    await expect(page.locator(".reader-convenience-menu")).toHaveCount(0);
    await expect(popup.locator(".reader-translation-target")).not.toBeEmpty({ timeout: 120_000 });
    expect(await popup.locator(".reader-translation-target").textContent()).toMatch(/[A-Za-z]/);

    // The source text is the exact slice of the material: no injected spaces.
    const segments = await page.evaluate(() => (window as unknown as { __segments: string[] }).__segments);
    expect(segments).toHaveLength(1);
    expect(segments[0]).not.toMatch(/\s/);
    expect(SAMPLE_TEXT).toContain(segments[0]);
  });

  test("the source text stays exact with show word spaces on", async ({ browser }) => {
    test.setTimeout(60_000);
    const page = await openReader(browser);
    await page.addInitScript(() => localStorage.setItem("wordMarkerReaderShowWordSpaces", "true"));
    await page.reload();
    await expect(tokens(page).first()).toBeVisible();
    await mouseSelect(page, 0, 3);
    await expect(page.locator("#readerTranslation")).toBeVisible();
    const segments = await page.evaluate(() => (window as unknown as { __segments: string[] }).__segments);
    expect(segments[0]).not.toMatch(/\s/);
    expect(SAMPLE_TEXT).toContain(segments[0]);
  });

  test("a non-English native keeps the radial quick menu", async ({ browser }) => {
    test.setTimeout(150_000);
    await patchNativeLanguage("Japanese");
    try {
      await waitForMaterialReady();
      const page = await openReader(browser);
      const start = await tokenCenter(page, 0);
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await expect(page.locator(".reader-convenience-menu")).toBeVisible();
      await page.mouse.up();

      await mouseSelect(page, 2, 5);
      await expect(page.locator("#readerTranslation")).toBeHidden();
      expect(await page.evaluate(() => (window as unknown as { __segments: string[] }).__segments)).toEqual([]);
    } finally {
      await patchNativeLanguage("English");
    }
  });
});

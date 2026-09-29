import { test, expect, type APIRequestContext, type Browser, type BrowserContext, type BrowserContextOptions, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { readFileSync } from "node:fs";
import pg from "pg";

/**
 * Behavioural smoke tests for reader sentence translation (TRN-005).
 *
 * Covers the acceptance criteria end to end: drag-selecting part of a sentence
 * opens the translation popup beside the selection with the original words,
 * the model-download state and then the English translation; a new selection
 * replaces the content; closing clears the highlight; word-info and the popup
 * are mutually exclusive; turning the page closes the popup; a missing model
 * shows the localised error; the model is not downloaded again after a
 * reload; the selected text never leaves the browser; and non-eligible readers
 * keep the radial quick menu. Runs on desktop and at 390x844 with touch.
 *
 * Runs as its own temporary user, so the shared storageState user is never
 * touched: the user is provisioned, logged in once through the API (the login
 * rate limit is shared with the other specs), enrolled in Japanese with English
 * as native language, and given a small Japanese .txt material. Afterwards the
 * account is removed through account deletion, and only the words this
 * material's import added are deleted. The whole suite is skipped, before
 * anything is created, when the model files are absent (they are gitignored).
 */

const FRONTEND_URL = process.env.PW_FRONTEND_URL ?? "http://localhost:5173";
const API_URL = process.env.PW_API_URL ?? "http://localhost:3000";
const MODEL_URL = "/models/ja-en-2.1/model.bin";
const PROVISION_SCRIPT = path.resolve(process.cwd(), "backend/scripts/provision_admin.js");
const TEMP_USER = { email: `pw-translation-${Date.now()}@example.com`, password: "Playwright123" };

const SENTENCES = [
  "私は毎日学校に行きます。",
  "今日はとても良い天気です。",
  "友達と一緒に公園で遊びました。",
  "明日は雨が降るかもしれません。",
  "母は台所で料理を作っています。",
  "この本はとても面白いです。"
];
// Long enough to span several 50-token pages.
const SAMPLE_TEXT = Array.from({ length: 4 }, () => SENTENCES.join("")).join("\n\n");

const EN = JSON.parse(readFileSync(path.resolve(process.cwd(), "frontend/public/locales.json"), "utf8")).en;

function databaseUrl(): string {
  const env = readFileSync(path.resolve(process.cwd(), ".env"), "utf8");
  const line = env.split(/\r?\n/).find((l) => l.startsWith("DATABASE_URL="));
  if (!line) {
    throw new Error("DATABASE_URL not found in .env");
  }
  return line.slice("DATABASE_URL=".length).trim().replace(/^['"]|['"]$/g, "");
}

let pool: pg.Pool | null = null;
let api: APIRequestContext | null = null;
let csrfToken = "";
let userProvisioned = false;
let loggedIn = false;
let storageState: BrowserContextOptions["storageState"];
let languageId: number;
let materialId: number | null = null;
let maxWordIdBefore: number | null = null;
/** Browser contexts opened by the current test, closed after it. */
const openContexts: BrowserContext[] = [];

async function patchNativeLanguage(nativeLanguage: string) {
  const response = await api!.patch("/api/settings", { headers: { "x-csrf-token": csrfToken }, data: { nativeLanguage } });
  expect(response.ok()).toBe(true);
}

/** Polls the material list until the upload is imported and translated for the current native language. */
async function waitForMaterialReady() {
  await expect.poll(async () => {
    const payload = await (await api!.get(`/api/materials?languageId=${languageId}`)).json();
    const material = payload.materials.find((entry: { id: number }) => entry.id === materialId);
    return material?.importStatus === "ready" && material?.translationStatus?.ready === true;
  }, { timeout: 90_000, intervals: [1_000] }).toBe(true);
}

/**
 * Opens a page on the reader with the sample material, in English, 50 tokens
 * per page. Records every selection's source text and every translation popup
 * message, so short-lived states can be asserted after the fact.
 */
async function openReader(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("wordMarkerLocale", "en");
    localStorage.setItem("wordMarkerStudyLanguageName", "Japanese");
    localStorage.setItem("wordMarkerReaderWordsPerPage", "50");
    const w = window as unknown as { __segments: string[]; __messages: string[] };
    w.__segments = [];
    w.__messages = [];
    document.addEventListener("reader:segment-selected", (event) => w.__segments.push((event as CustomEvent).detail.sourceText));
    new MutationObserver(() => {
      const text = document.querySelector("#readerTranslation .reader-translation-message")?.textContent;
      if (text && w.__messages[w.__messages.length - 1] !== text) {
        w.__messages.push(text);
      }
    }).observe(document, { childList: true, subtree: true, characterData: true });
  });
  await page.goto("/reader");
  await selectMaterial(page);
}

/** Opens the sample material from the document list (behind the Documents tab on mobile). */
async function selectMaterial(page: Page) {
  const materialButton = page.locator(`[data-material-id="${materialId}"]`);
  await materialButton.waitFor({ state: "attached" });
  if (!(await materialButton.isVisible())) {
    await page.locator('#readerSidebarTabs [data-reader-sidebar-tab="documents"]').click();
  }
  await materialButton.click();
  await expect(tokens(page).first()).toBeVisible();
  // The app may also restore the last-read material on boot; let both loads settle.
  await page.waitForLoadState("networkidle");
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

/** Press-and-hold then drag with real touch events (Chromium CDP). */
async function touchSelect(page: Page, from: number, to: number) {
  const cdp = await page.context().newCDPSession(page);
  const start = await tokenCenter(page, from);
  const end = await tokenCenter(page, to);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [start] });
  await page.waitForTimeout(600);
  for (let step = 1; step <= 8; step += 1) {
    const point = { x: start.x + ((end.x - start.x) * step) / 8, y: start.y + ((end.y - start.y) * step) / 8 };
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [point] });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}

async function expectPopupBesideSelection(page: Page) {
  const popup = await page.locator("#readerTranslation").boundingBox();
  const selected = await page.locator("#readerText .is-segment-selected").evaluateAll((nodes) => nodes.map((node) => {
    const rect = node.getBoundingClientRect();
    return { top: rect.top, left: rect.left, bottom: rect.bottom, right: rect.right };
  }));
  expect(popup).not.toBeNull();
  expect(selected.length).toBeGreaterThan(1);
  for (const rect of selected) {
    const overlaps = popup!.x < rect.right && popup!.x + popup!.width > rect.left && popup!.y < rect.bottom && popup!.y + popup!.height > rect.top;
    expect(overlaps, "popup covers the selection").toBe(false);
  }
}

async function selectedSurfaces(page: Page, from: number, to: number) {
  return (await tokens(page).allTextContents()).slice(from, to + 1);
}

async function translateDirectly(page: Page, text: string) {
  return page.evaluate(async (sourceText) => {
    const { translate } = await import("/js/features/translation/translation.service.js");
    return (await translate(sourceText)).targetText;
  }, text);
}

/** Opens a desktop page signed in as the temporary user. */
async function newDesktopPage(browser: Browser) {
  const context = await browser.newContext({ storageState, baseURL: FRONTEND_URL });
  openContexts.push(context);
  return context.newPage();
}

/** Opens a 390x844 touch page signed in as the temporary user. */
async function newMobilePage(browser: Browser) {
  const context = await browser.newContext({ storageState, baseURL: FRONTEND_URL, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  openContexts.push(context);
  return context.newPage();
}

test.describe("reader sentence translation", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async ({ playwright }) => {
    const probe = await playwright.request.newContext();
    const modelStatus = (await probe.head(`${FRONTEND_URL}${MODEL_URL}`)).status();
    await probe.dispose();
    test.skip(modelStatus === 404, "Translation model files are not present.");

    pool = new pg.Pool({ connectionString: databaseUrl() });
    execFileSync("node", [PROVISION_SCRIPT], {
      stdio: "ignore",
      env: { ...process.env, ADMIN_EMAIL: TEMP_USER.email, ADMIN_PASSWORD: TEMP_USER.password, ADMIN_IS_ADMIN: "false" }
    });
    userProvisioned = true;

    api = await playwright.request.newContext({ baseURL: API_URL });
    const anonymous = await (await api.get("/api/auth/me")).json();
    const login = await api.post("/api/auth/login", { headers: { "x-csrf-token": anonymous.csrfToken }, data: TEMP_USER });
    expect(login.status(), "temporary user login").toBe(200);
    loggedIn = true;
    csrfToken = (await login.json()).csrfToken;

    await patchNativeLanguage("English");
    const enrolment = await api.post("/api/languages", { headers: { "x-csrf-token": csrfToken }, data: { name: "Japanese" } });
    expect(enrolment.status()).toBe(201);
    languageId = (await enrolment.json()).language.id;
    storageState = await api.storageState();

    // Words above this id that only this material references were added by its import.
    maxWordIdBefore = (await pool.query("SELECT COALESCE(MAX(id), 0) AS max FROM words WHERE language_id = $1", [languageId])).rows[0].max;
    const upload = await api.post("/api/materials", {
      headers: { "x-csrf-token": csrfToken },
      multipart: {
        languageId: String(languageId),
        file: { name: `pw-translation-${Date.now()}.txt`, mimeType: "text/plain", buffer: Buffer.from(SAMPLE_TEXT, "utf8") }
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
    if (!userProvisioned) {
      return;
    }
    // Collect the material's words before account deletion removes its tokens.
    const materialWordIds = materialId === null || maxWordIdBefore === null
      ? []
      : (await pool!.query("SELECT DISTINCT word_id FROM material_tokens WHERE material_id = $1 AND word_id > $2", [materialId, maxWordIdBefore])).rows.map((row) => row.word_id);
    if (loggedIn) {
      const deletion = await api!.delete("/api/settings/account", { headers: { "x-csrf-token": csrfToken }, data: { confirmation: TEMP_USER.email } });
      expect(deletion.status(), "temporary account deletion").toBe(200);
    } else {
      // Login failed, so the provisioned user owns no data beyond its own row.
      await pool!.query("DELETE FROM users WHERE lower(email) = lower($1)", [TEMP_USER.email]);
    }
    if (materialWordIds.length) {
      await pool!.query(
        `DELETE FROM words w WHERE w.id = ANY($1::int[])
           AND NOT EXISTS (SELECT 1 FROM material_tokens mt WHERE mt.word_id = w.id)
           AND NOT EXISTS (SELECT 1 FROM user_words uw WHERE uw.word_id = w.id)`,
        [materialWordIds]
      );
    }
    await api?.dispose();
    await pool!.end();
  });

  test("desktop: select, translate, replace, close, word-info exclusivity and page turn", async ({ browser }) => {
    const page = await newDesktopPage(browser);
    test.setTimeout(180_000);
    const requests: string[] = [];
    page.on("request", (request) => requests.push(`${request.url()}\n${request.postData() ?? ""}`));
    await openReader(page);
    const popup = page.locator("#readerTranslation");

    // First selection: original on top, model download, then the translation.
    let windowStart = requests.length;
    await mouseSelect(page, 0, 3);
    await expect(popup).toBeVisible();
    await expectPopupBesideSelection(page);
    await expect(popup.locator("[data-source-word-index]")).toHaveText(await selectedSurfaces(page, 0, 3));
    await expect(popup.locator(".reader-translation-target")).not.toBeEmpty({ timeout: 120_000 });
    const messages = await page.evaluate(() => (window as unknown as { __messages: string[] }).__messages);
    expect(messages.some((message) => message.startsWith(EN["reader.translation.loadingModel"]))).toBe(true);
    const translationRequests = requests.slice(windowStart).map((entry) => new URL(entry.split("\n")[0]).pathname);
    expect(translationRequests.some((pathname) => pathname.startsWith("/models/ja-en-2.1/"))).toBe(true);
    for (const pathname of translationRequests) {
      expect(pathname, "unexpected request during translation").toMatch(/^\/(vendor\/bergamot-0\.4\.9|models)\//);
    }

    // A new selection replaces the content; the final result matches the newest selection.
    await mouseSelect(page, 4, 6);
    await mouseSelect(page, 8, 11);
    await expect(popup.locator("[data-source-word-index]")).toHaveText(await selectedSurfaces(page, 8, 11));
    await expect(popup.locator(".reader-translation-target")).not.toBeEmpty({ timeout: 60_000 });
    const segments = await page.evaluate(() => (window as unknown as { __segments: string[] }).__segments);
    const shownTarget = await popup.locator(".reader-translation-target").textContent();
    await page.waitForTimeout(1_000);
    await expect(popup.locator(".reader-translation-target")).toHaveText(shownTarget ?? "");

    // Close with × and with Escape; both clear the highlight.
    await popup.locator("[data-reader-translation-close]").click();
    await expect(popup).toBeHidden();
    await expect(page.locator("#readerText .is-segment-selected")).toHaveCount(0);
    await mouseSelect(page, 0, 2);
    await expect(popup).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(popup).toBeHidden();
    await expect(page.locator("#readerText .is-segment-selected")).toHaveCount(0);

    // Word-info and the popup are never visible together.
    await mouseSelect(page, 0, 2);
    await expect(popup).toBeVisible();
    await tokens(page).nth(12).click();
    await expect(page.locator("#readerWordInfo")).toBeVisible();
    await expect(popup).toBeHidden();
    await expect(page.locator("#readerText .is-segment-selected")).toHaveCount(0);
    await mouseSelect(page, 0, 2);
    await expect(popup).toBeVisible();
    await expect(page.locator("#readerWordInfo")).toBeHidden();

    // Turning the page closes the popup and clears the highlight.
    await page.locator("#readerNextPage").click();
    await expect(popup).toBeHidden();
    await expect(page.locator("#readerText .is-segment-selected")).toHaveCount(0);

    // The newest selection's translation is what was shown, never a stale one.
    expect(await translateDirectly(page, segments[segments.length - 1])).toBe(shownTarget);

    // The selected text never left the browser.
    for (const sourceText of segments) {
      for (const entry of requests) {
        expect(entry.includes(sourceText) || entry.includes(encodeURIComponent(sourceText)), `request leaked "${sourceText}"`).toBe(false);
      }
    }
  });

  test("desktop: the model is not downloaded again after a reload", async ({ browser }) => {
    const page = await newDesktopPage(browser);
    test.setTimeout(180_000);
    await openReader(page);
    const popup = page.locator("#readerTranslation");
    await mouseSelect(page, 0, 3);
    await expect(popup.locator(".reader-translation-target")).not.toBeEmpty({ timeout: 120_000 });

    // Count bytes that actually crossed the network; cache hits transfer nothing.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Network.enable");
    const responseUrls = new Map<string, string>();
    const servedFromCache = new Set<string>();
    let modelBytes = 0;
    cdp.on("Network.requestServedFromCache", ({ requestId }) => servedFromCache.add(requestId));
    cdp.on("Network.responseReceived", ({ requestId, response }) => responseUrls.set(requestId, response.url));
    cdp.on("Network.loadingFinished", ({ requestId, encodedDataLength }) => {
      if (responseUrls.get(requestId)?.includes("/models/ja-en-2.1/") && !servedFromCache.has(requestId)) {
        modelBytes += encodedDataLength;
      }
    });
    await page.reload();
    await selectMaterial(page);
    await mouseSelect(page, 0, 3);
    await expect(popup.locator(".reader-translation-target")).not.toBeEmpty({ timeout: 60_000 });
    expect([...responseUrls.values()].some((url) => url.endsWith("/js/main.js")), "network capture is working").toBe(true);
    expect(modelBytes, "model files were downloaded again").toBeLessThan(64 * 1024);
    await cdp.detach();
  });

  test("desktop: a missing model shows the localised error", async ({ browser }) => {
    const page = await newDesktopPage(browser);
    await page.route("**/models/ja-en-2.1/**", (route) => route.fulfill({ status: 404, body: "" }));
    await openReader(page);
    await mouseSelect(page, 0, 3);
    await expect(page.locator("#readerTranslation [role=alert]")).toHaveText(EN["reader.translation.error.modelUnavailable"], { timeout: 30_000 });
  });

  test("mobile: hold-and-drag translates beside the selection, tap opens word-info", async ({ browser }) => {
    test.setTimeout(180_000);
    const page = await newMobilePage(browser);
    try {
      await openReader(page);
      const popup = page.locator("#readerTranslation");
      await touchSelect(page, 0, 3);
      await expect(popup).toBeVisible();
      await expectPopupBesideSelection(page);
      await expect(popup.locator("[data-source-word-index]")).toHaveText(await selectedSurfaces(page, 0, 3));
      await expect(popup.locator(".reader-translation-target")).not.toBeEmpty({ timeout: 120_000 });

      await touchSelect(page, 5, 7);
      await expect(popup.locator("[data-source-word-index]")).toHaveText(await selectedSurfaces(page, 5, 7));

      // A touch drag produces no follow-up click, so wait out the post-gesture click suppression.
      await page.waitForTimeout(400);
      await tokens(page).nth(10).tap();
      await expect(page.locator("#readerWordInfo")).toBeVisible();
      await expect(popup).toBeHidden();
      await expect(page.locator("#readerText .is-segment-selected")).toHaveCount(0);

      // The word-info sheet covers the text on mobile, so close it before selecting again.
      await page.locator("#readerWordInfo [data-reader-word-info-close]").tap();
      await expect(page.locator("#readerWordInfo")).toBeHidden();
      await touchSelect(page, 0, 2);
      await expect(popup).toBeVisible();
      await popup.locator("[data-reader-translation-close]").tap();
      await expect(popup).toBeHidden();
      await expect(page.locator("#readerText .is-segment-selected")).toHaveCount(0);
    } finally {
      await page.context().close();
    }
  });

  test("non-eligible readers keep the radial quick menu", async ({ browser }) => {
    const page = await newDesktopPage(browser);
    test.setTimeout(150_000);
    await patchNativeLanguage("Chinese");
    try {
      await waitForMaterialReady();
      await openReader(page);
      const start = await tokenCenter(page, 0);
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await expect(page.locator(".reader-convenience-menu")).toBeVisible();
      await page.mouse.up();

      await mouseSelect(page, 2, 5);
      await expect(page.locator("#readerText .is-segment-selected")).toHaveCount(0);
      await expect(page.locator("#readerTranslation")).toBeHidden();
      expect(await page.evaluate(() => (window as unknown as { __segments: string[] }).__segments)).toEqual([]);
    } finally {
      await patchNativeLanguage("English");
    }
  });
});

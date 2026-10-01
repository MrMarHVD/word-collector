import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import type pg from "pg";
import { createTempUser, deleteTempUser, deleteUnusedWords, EN, fill, FRONTEND_URL, importWords, openPool, type TempUser } from "./support/temp-data";

/**
 * Behavioural smoke tests for flashcard practice.
 *
 * Covers the primary flow end to end: the landing page, starting a session
 * with fewer valid words than requested, flipping and answering cards with
 * the mouse and the keyboard, the results summary and the "known" answer
 * persisting; the words-per-session setting; exiting mid-session; and the
 * marked-words empty message.
 *
 * Runs as its own temporary user, because answering changes word statuses and
 * the settings panel changes the user's words per session. Its three words
 * are imported, set to learning and opened once through the API so they are
 * valid practice words. The account and those words are removed afterwards.
 */

const STAMP = Date.now();
const WORD_PREFIX = `pw-practice-${STAMP}-`;
const WORDS: [string, string][] = ["a", "b", "c"].map((suffix) => [`${WORD_PREFIX}${suffix}`, `practice ${suffix}`]);

let pool: pg.Pool;
const user: Partial<TempUser> = {};
let collectionId: number;
const openContexts: BrowserContext[] = [];

/** Opens the practice tab signed in as the temporary user, in English. */
async function openPractice(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ storageState: user.storageState, baseURL: FRONTEND_URL });
  openContexts.push(context);
  const page = await context.newPage();
  await page.goto("/practice");
  await page.locator("#localeSelect").selectOption("en");
  await expect(page.locator('nav.tabs [data-tab="practice"]')).toHaveClass(/is-active/);
  return page;
}

/** Returns the statuses of the temporary words, keyed by word. */
async function wordStatuses(): Promise<Record<string, string>> {
  const payload = await (await user.api!.get(`/api/collections/${collectionId}/words`)).json();
  return Object.fromEntries(payload.words.map((entry: { word: string; status: string }) => [entry.word, entry.status]));
}

test.describe("practice", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async ({ playwright }) => {
    pool = openPool();
    await createTempUser(playwright.request, user, "pw-practice");
    collectionId = await importWords(user as TempUser, user.languageId!, `PW practice ${STAMP}`, WORDS);
    const payload = await (await user.api!.get(`/api/collections/${collectionId}/words`)).json();
    const wordIds = payload.words.map((entry: { id: number }) => entry.id);
    const status = await user.api!.post("/api/words/status", { headers: { "x-csrf-token": user.csrfToken! }, data: { wordIds, status: "learning" } });
    expect(status.ok()).toBe(true);
    // Practice only offers learning words that have been opened at least once.
    for (const id of wordIds) {
      expect((await user.api!.post(`/api/words/${id}/click`, { headers: { "x-csrf-token": user.csrfToken! } })).ok()).toBe(true);
    }
  });

  test.afterEach(async () => {
    await Promise.all(openContexts.splice(0).map((context) => context.close()));
  });

  test.afterAll(async () => {
    await deleteTempUser(user, pool);
    await deleteUnusedWords(pool, { like: `${WORD_PREFIX}%` });
    await pool.end();
  });

  test("start a session, answer every card and finish", async ({ browser }) => {
    const page = await openPractice(browser);
    const content = page.locator("#practiceContent");

    // Landing: 20 words per session by default, so three valid words is too few.
    await expect(content.getByRole("heading", { name: EN["practice.title"] })).toBeVisible();
    await content.locator("[data-practice-start]").click();
    await expect(content.getByText(fill(EN["practice.onlyValid"], { count: 3 }))).toBeVisible();
    await content.locator("[data-practice-begin]").click();

    const progress = content.locator(".practice-progress");
    const card = content.locator("[data-practice-card]");
    const know = content.locator('[data-practice-answer="known"]');
    const dontKnow = content.locator('[data-practice-answer="unknown"]');
    const shownWords: string[] = [];

    // Card 1: the answers unlock only after flipping; answer "Know" with the mouse.
    await expect(progress).toHaveText(fill(EN["practice.progress"], { current: 1, total: 3 }));
    await expect(know).toBeDisabled();
    shownWords.push((await card.locator(".practice-card-word").textContent()) ?? "");
    await card.click();
    await expect(know).toBeEnabled();
    await know.click();

    // Card 2: flip with Space, answer "Don't know" with 1; then go back and forward.
    await expect(progress).toHaveText(fill(EN["practice.progress"], { current: 2, total: 3 }));
    shownWords.push((await card.locator(".practice-card-word").textContent()) ?? "");
    await page.keyboard.press("Space");
    await expect(dontKnow).toBeEnabled();
    await page.keyboard.press("1");
    await expect(progress).toHaveText(fill(EN["practice.progress"], { current: 3, total: 3 }));
    await content.locator("[data-practice-previous]").click();
    await expect(progress).toHaveText(fill(EN["practice.progress"], { current: 2, total: 3 }));
    await content.locator("[data-practice-next]").click();

    // Card 3: flip with Enter, answer "Don't know" with the mouse, which finishes the session.
    await expect(progress).toHaveText(fill(EN["practice.progress"], { current: 3, total: 3 }));
    shownWords.push((await card.locator(".practice-card-word").textContent()) ?? "");
    await page.keyboard.press("Enter");
    await dontKnow.click();

    await expect(content.getByRole("heading", { name: EN["practice.doneTitle"] })).toBeVisible();
    await expect(content.getByText(fill(EN["practice.doneBody"], { total: 3 }))).toBeVisible();
    const summary = content.locator(".practice-summary-list");
    await expect(summary.locator("> div").filter({ hasText: EN["practice.knownCount"] }).locator("dd")).toHaveText("1");
    await expect(summary.locator("> div").filter({ hasText: EN["practice.learningCount"] }).locator("dd")).toHaveText("2");

    // Every word was shown once, and only the "Know" answer changed a status.
    expect([...shownWords].sort()).toEqual(WORDS.map(([word]) => word).sort());
    await expect.poll(wordStatuses).toEqual({
      [shownWords[0]]: "known",
      [shownWords[1]]: "learning",
      [shownWords[2]]: "learning"
    });

    await content.locator("[data-practice-done]").click();
    await expect(content.locator("[data-practice-start]")).toBeVisible();
  });

  test("words per session setting shortens the session, and exit returns to the landing page", async ({ browser }) => {
    const page = await openPractice(browser);
    const content = page.locator("#practiceContent");

    await content.locator('[data-practice-panel="settings"]').click();
    await expect(content.getByRole("heading", { name: EN["practice.settingsTitle"] })).toBeVisible();
    await content.locator("#practiceWordsPerSession").fill("2");
    await content.locator("#practiceWordsPerSession").blur();
    await expect(content.locator("#practiceSettingsStatus")).toHaveText(EN["settings.saved"]);

    // The setting persists and the two remaining learning words fill the session.
    await page.reload();
    await page.locator("#localeSelect").selectOption("en");
    await expect(content.locator("dl > div").filter({ hasText: EN["practice.wordsPerSession"] }).locator("dd")).toHaveText("2");
    await content.locator("[data-practice-start]").click();
    await expect(content.locator(".practice-progress")).toHaveText(fill(EN["practice.progress"], { current: 1, total: 2 }));

    await content.locator("[data-practice-done]").click();
    await expect(content.getByRole("heading", { name: EN["practice.title"] })).toBeVisible();
  });

  test("marked-words session without marked words explains why it cannot start", async ({ browser }) => {
    const page = await openPractice(browser);
    const content = page.locator("#practiceContent");
    await content.locator("[data-practice-start-marked]").click();
    await expect(content.locator("#practiceStatus")).toHaveText(EN["practice.markedEmpty"]);
    await expect(content.locator("[data-practice-card]")).toHaveCount(0);
  });
});

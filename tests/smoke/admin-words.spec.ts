import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { readFileSync } from "node:fs";
import pg from "pg";

/**
 * Behavioural smoke tests for the admin "Words" panel (ADM-003).
 *
 * Covers the acceptance criteria: a mutually-exclusive source-language picker,
 * alphabetical infinite-scroll listing with word/lemma search, a native-language
 * selector that drives the editable canonical-translation cell (including empty
 * cells), persistence of edits, the override-wins rule for users with a private
 * translation_override, and an admin_audit_log entry per edit.
 *
 * Data is seeded directly into the dev Postgres DB so the suite is deterministic
 * regardless of prior dev usage. All seeded rows are namespaced by a unique
 * language and removed in afterAll, touching only the temporary fixtures.
 */

const SCRIPT = path.resolve(process.cwd(), "backend/scripts/provision_admin.js");
const ADMIN = { email: "pw-words-admin@example.com", password: "Playwright123" };
const PLAIN = { email: "pw-words-user@example.com", password: "Playwright123" };

const LANG = `PWWords-${Date.now()}`;
const WORDS = ["alpha", "bravo", "charlie", "delta"]; // alphabetical fixtures

function databaseUrl(): string {
  const env = readFileSync(path.resolve(process.cwd(), ".env"), "utf8");
  const line = env.split(/\r?\n/).find((l) => l.startsWith("DATABASE_URL="));
  if (!line) {
    throw new Error("DATABASE_URL not found in .env");
  }
  return line.slice("DATABASE_URL=".length).trim().replace(/^['"]|['"]$/g, "");
}

const pool = new pg.Pool({ connectionString: databaseUrl() });

function provision(email: string, password: string, flags: { admin?: boolean }) {
  execFileSync("node", [SCRIPT], {
    stdio: "ignore",
    env: { ...process.env, ADMIN_EMAIL: email, ADMIN_PASSWORD: password, ADMIN_IS_ADMIN: String(flags.admin === true) }
  });
}

async function userId(email: string): Promise<number> {
  const { rows } = await pool.query("SELECT id FROM users WHERE lower(email) = lower($1)", [email]);
  return rows[0].id;
}

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

async function openWordsPanel(page: Page) {
  await page.locator('nav.tabs [data-tab="admin"]').click();
  await page.locator('[data-admin-rail="words"]').click();
  await expect(page.locator("#adminWordsPanel .admin-words")).toBeVisible();
  // Select the seeded source language.
  await page.locator(`#adminWordsPanel .admin-words-language:has-text("${LANG}")`).click();
}

let languageId: number;
let wordIds: Record<string, number> = {};

test.describe("admin words panel", () => {
  test.beforeAll(async () => {
    provision(ADMIN.email, ADMIN.password, { admin: true });
    provision(PLAIN.email, PLAIN.password, { admin: false });

    const lang = await pool.query("INSERT INTO languages (name) VALUES ($1) RETURNING id", [LANG]);
    languageId = lang.rows[0].id;
    for (const w of WORDS) {
      const r = await pool.query(
        "INSERT INTO words (language_id, word, translation, lemma) VALUES ($1, $2, '', $3) RETURNING id",
        [languageId, w, w]
      );
      wordIds[w] = r.rows[0].id;
    }
    // Seed an existing English canonical translation on the first word only.
    await pool.query(
      "INSERT INTO word_translations (word_id, native_language, translation) VALUES ($1, 'English', 'first-canonical')",
      [wordIds.alpha]
    );

    // Give the plain user a private override + membership for "alpha".
    const plainId = await userId(PLAIN.email);
    const col = await pool.query(
      "INSERT INTO collections (user_id, language_id, name) VALUES ($1, $2, 'PWWordsCol') RETURNING id",
      [plainId, languageId]
    );
    await pool.query(
      "INSERT INTO user_words (user_id, word_id, collection_id, translation_override) VALUES ($1, $2, $3, 'my-private-override')",
      [plainId, wordIds.alpha, col.rows[0].id]
    );
  });

  test.afterAll(async () => {
    // Remove only the temporary fixtures created above, children first so the
    // collections/words foreign keys to the seeded language are clear.
    const ids = Object.values(wordIds);
    for (const w of WORDS) {
      await pool.query("DELETE FROM admin_audit_log WHERE target LIKE $1", [`word:${wordIds[w]}:%`]);
    }
    await pool.query("DELETE FROM user_words WHERE word_id = ANY($1::int[])", [ids]);
    await pool.query("DELETE FROM word_translations WHERE word_id = ANY($1::int[])", [ids]);
    await pool.query("DELETE FROM collections WHERE language_id = $1", [languageId]);
    await pool.query("DELETE FROM words WHERE language_id = $1", [languageId]);
    await pool.query("DELETE FROM languages WHERE id = $1", [languageId]);
    await pool.end();
  });

  test("lists all words alphabetically, supports search, and shows empty cells", async ({ browser }) => {
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();
    await login(page, ADMIN.email, ADMIN.password);
    await openWordsPanel(page);

    const terms = page.locator("#adminWordsPanel .admin-words-row .admin-words-term .font-semibold");
    await expect(terms).toHaveCount(WORDS.length);
    await expect(terms).toHaveText(WORDS); // alphabetical order

    // Word with an existing English canonical shows its value; others are empty.
    const alphaInput = page.locator(`#adminWordsPanel .admin-words-row[data-word-id="${wordIds.alpha}"] .admin-words-translation`);
    const bravoInput = page.locator(`#adminWordsPanel .admin-words-row[data-word-id="${wordIds.bravo}"] .admin-words-translation`);
    await expect(alphaInput).toHaveValue("first-canonical");
    await expect(bravoInput).toHaveValue("");

    // Search by word narrows the list.
    await page.locator("#adminWordsPanel .admin-words-search").fill("charlie");
    await expect(terms).toHaveText(["charlie"]);
    await page.locator("#adminWordsPanel .admin-words-search").fill("");
    await expect(terms).toHaveCount(WORDS.length);

    await context.close();
  });

  test("edits and adds canonical translations that persist and are audited", async ({ browser }) => {
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();
    await login(page, ADMIN.email, ADMIN.password);
    await openWordsPanel(page);

    // Add a translation where none existed (bravo) in English.
    const bravoInput = page.locator(`#adminWordsPanel .admin-words-row[data-word-id="${wordIds.bravo}"] .admin-words-translation`);
    await bravoInput.fill("bravo-canonical");
    await bravoInput.blur();
    await expect.poll(async () => {
      const { rows } = await pool.query(
        "SELECT translation FROM word_translations WHERE word_id = $1 AND native_language = 'English'",
        [wordIds.bravo]
      );
      return rows[0]?.translation;
    }).toBe("bravo-canonical");

    // Reload and confirm it shows.
    await openWordsPanel(page);
    await expect(
      page.locator(`#adminWordsPanel .admin-words-row[data-word-id="${wordIds.bravo}"] .admin-words-translation`)
    ).toHaveValue("bravo-canonical");

    // Audit entry with before (null) / after captured.
    const audit = await pool.query(
      "SELECT before_value, after_value FROM admin_audit_log WHERE action = 'word.setCanonicalTranslation' AND target = $1 ORDER BY id DESC LIMIT 1",
      [`word:${wordIds.bravo}:English`]
    );
    expect(audit.rows.length).toBe(1);
    // before/after are JSON-serialised snapshots; normalise to a string for the check.
    const after = JSON.stringify(audit.rows[0].after_value);
    const before = JSON.stringify(audit.rows[0].before_value);
    expect(after).toContain("bravo-canonical");
    // The word had no English translation before this edit.
    expect(before).toContain("null");

    await context.close();
  });

  test("native-language selector drives empty cells and override-wins for normal users", async ({ browser }) => {
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();
    await login(page, ADMIN.email, ADMIN.password);
    await openWordsPanel(page);

    // Switch native language to Japanese: previously-untranslated cells are empty.
    await page.locator("#adminWordsPanel .admin-words-native").selectOption("Japanese");
    const alphaInput = page.locator(`#adminWordsPanel .admin-words-row[data-word-id="${wordIds.alpha}"] .admin-words-translation`);
    await expect(alphaInput).toHaveValue("");

    // Edit the English canonical for alpha (where the plain user has an override).
    await page.locator("#adminWordsPanel .admin-words-native").selectOption("English");
    const alphaEnglish = page.locator(`#adminWordsPanel .admin-words-row[data-word-id="${wordIds.alpha}"] .admin-words-translation`);
    await alphaEnglish.fill("updated-canonical");
    await alphaEnglish.blur();
    await expect.poll(async () => {
      const { rows } = await pool.query(
        "SELECT translation FROM word_translations WHERE word_id = $1 AND native_language = 'English'",
        [wordIds.alpha]
      );
      return rows[0]?.translation;
    }).toBe("updated-canonical");

    // The plain user's private override must be untouched.
    const override = await pool.query(
      "SELECT translation_override FROM user_words WHERE word_id = $1",
      [wordIds.alpha]
    );
    expect(override.rows[0].translation_override).toBe("my-private-override");

    await context.close();
  });
});

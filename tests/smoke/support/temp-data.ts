import { expect, type APIRequestContext, type BrowserContextOptions } from "@playwright/test";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { readFileSync } from "node:fs";
import pg from "pg";

/**
 * @fileoverview Shared temporary-data helpers for the behavioural smoke specs.
 *
 * Specs that change user settings run as their own temporary user, provisioned
 * with the backend's `provision_admin.js`, logged in once through the API (the
 * login rate limit is shared by every spec) and removed through account
 * deletion. Specs that only add their own data reuse the seeded storageState
 * user and remove that data afterwards. Global words that a spec's imports
 * create are deleted once nothing references them any more.
 */

export const FRONTEND_URL = process.env.PW_FRONTEND_URL ?? "http://localhost:5173";
export const API_URL = process.env.PW_API_URL ?? "http://localhost:3000";
export const SHARED_USER_STATE = "tests/.auth/user.json";
const PROVISION_SCRIPT = path.resolve(process.cwd(), "backend/scripts/provision_admin.js");

/** UI strings per locale, for asserting visible localised text. */
export const LOCALES = JSON.parse(readFileSync(path.resolve(process.cwd(), "frontend/public/locales.json"), "utf8"));
export const EN = LOCALES.en;

/**
 * Fills a `{placeholder}` template from the locale file.
 *
 * @param template - Localised string with `{name}` placeholders.
 * @param values - Replacement per placeholder.
 * @returns The filled string.
 */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, name) => (name in values ? String(values[name]) : match));
}

function databaseUrl(): string {
  const env = readFileSync(path.resolve(process.cwd(), ".env"), "utf8");
  const line = env.split(/\r?\n/).find((l) => l.startsWith("DATABASE_URL="));
  if (!line) {
    throw new Error("DATABASE_URL not found in .env");
  }
  return line.slice("DATABASE_URL=".length).trim().replace(/^['"]|['"]$/g, "");
}

/** Opens a pool on the dev database, used only for cleanup and persistence checks. */
export function openPool(): pg.Pool {
  return new pg.Pool({ connectionString: databaseUrl() });
}

/** An authenticated API session plus the CSRF token its mutations need. */
export type ApiSession = { api: APIRequestContext; csrfToken: string };

/** A temporary user, enrolled in Japanese with English as native language. */
export type TempUser = ApiSession & {
  email: string;
  password: string;
  languageId: number;
  storageState: BrowserContextOptions["storageState"];
  loggedIn: boolean;
};

/**
 * Opens an API session as the seeded storageState user, for setting up and
 * removing a spec's own data without another login.
 *
 * @param request - Playwright's request factory (`playwright.request`).
 * @returns The session; dispose `api` when done.
 */
export async function sharedUserApi(request: { newContext: (options: object) => Promise<APIRequestContext> }): Promise<ApiSession> {
  const api = await request.newContext({ baseURL: API_URL, storageState: SHARED_USER_STATE });
  const me = await (await api.get("/api/auth/me")).json();
  expect(me.user, "shared storageState user is signed in").toBeTruthy();
  return { api, csrfToken: me.csrfToken };
}

/**
 * Provisions a temporary user, logs it in through the API, sets English as
 * native language and enrols it in Japanese. The returned object is filled in
 * step by step, so {@link deleteTempUser} can clean up after a partial failure.
 *
 * @param request - Playwright's request factory (`playwright.request`).
 * @param user - Object to fill; pass the same object to {@link deleteTempUser}.
 * @param prefix - Email prefix identifying the spec.
 * @throws When login, the settings change or the enrolment fails.
 */
export async function createTempUser(request: { newContext: (options: object) => Promise<APIRequestContext> }, user: Partial<TempUser>, prefix: string): Promise<TempUser> {
  user.email = `${prefix}-${Date.now()}@example.com`;
  user.password = "Playwright123";
  execFileSync("node", [PROVISION_SCRIPT], {
    stdio: "ignore",
    env: { ...process.env, ADMIN_EMAIL: user.email, ADMIN_PASSWORD: user.password, ADMIN_IS_ADMIN: "false" }
  });
  user.api = await request.newContext({ baseURL: API_URL });
  const anonymous = await (await user.api.get("/api/auth/me")).json();
  const login = await user.api.post("/api/auth/login", { headers: { "x-csrf-token": anonymous.csrfToken }, data: { email: user.email, password: user.password } });
  expect(login.status(), "temporary user login").toBe(200);
  user.loggedIn = true;
  user.csrfToken = (await login.json()).csrfToken;

  const settings = await user.api.patch("/api/settings", { headers: { "x-csrf-token": user.csrfToken }, data: { nativeLanguage: "English" } });
  expect(settings.ok()).toBe(true);
  const enrolment = await user.api.post("/api/languages", { headers: { "x-csrf-token": user.csrfToken }, data: { name: "Japanese" } });
  expect(enrolment.status()).toBe(201);
  user.languageId = (await enrolment.json()).language.id;
  user.storageState = await user.api.storageState();
  return user as TempUser;
}

/**
 * Removes a temporary user through account deletion, or directly when it never
 * logged in (it then owns nothing but its row). No-op when it is already gone,
 * e.g. because the spec deleted it through the UI.
 *
 * @param user - The object passed to {@link createTempUser}.
 * @param pool - Database pool from {@link openPool}.
 */
export async function deleteTempUser(user: Partial<TempUser>, pool: pg.Pool): Promise<void> {
  if (!user.email) {
    return;
  }
  const exists = (await pool.query("SELECT 1 FROM users WHERE lower(email) = lower($1)", [user.email])).rowCount;
  if (exists && user.loggedIn) {
    const deletion = await user.api!.delete("/api/settings/account", { headers: { "x-csrf-token": user.csrfToken! }, data: { confirmation: user.email } });
    expect(deletion.status(), "temporary account deletion").toBe(200);
  } else if (exists) {
    await pool.query("DELETE FROM users WHERE lower(email) = lower($1)", [user.email]);
  }
  await user.api?.dispose();
}

/**
 * Imports a two-column word list into a new collection through the API.
 *
 * @param session - API session of the owner.
 * @param languageId - Study language of the collection.
 * @param collectionName - Name of the new collection.
 * @param words - `[word, translation]` rows.
 * @returns The created collection's id.
 */
export async function importWords(session: ApiSession, languageId: number, collectionName: string, words: [string, string][]): Promise<number> {
  const response = await session.api.post("/api/import", {
    headers: { "x-csrf-token": session.csrfToken },
    data: { languageId, collectionName, words: words.map(([word, translation]) => ({ word, translation })) }
  });
  expect(response.ok(), "word import").toBe(true);
  return (await response.json()).collection.id;
}

/**
 * Deletes global words that a spec created, skipping any that a user's word
 * list or a material still references.
 *
 * @param pool - Database pool from {@link openPool}.
 * @param where - Either the ids to consider or a `LIKE` pattern on the word.
 */
export async function deleteUnusedWords(pool: pg.Pool, where: { ids: number[] } | { like: string }): Promise<void> {
  const [condition, value] = "ids" in where ? ["w.id = ANY($1::int[])", where.ids] : ["w.word LIKE $1", where.like];
  if (Array.isArray(value) && !value.length) {
    return;
  }
  await pool.query(
    `DELETE FROM words w WHERE ${condition}
       AND NOT EXISTS (SELECT 1 FROM material_tokens mt WHERE mt.word_id = w.id)
       AND NOT EXISTS (SELECT 1 FROM user_words uw WHERE uw.word_id = w.id)`,
    [value]
  );
}

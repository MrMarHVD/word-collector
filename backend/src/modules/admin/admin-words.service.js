/**
 * @fileoverview Admin-words service. Business logic for the admin "Words" panel
 * (issue ADM-003): browsing the global word catalogue for one source language
 * with keyset pagination and search, and upserting the shared canonical
 * translation for a (word, native language) pair. Every translation edit is
 * audited via {@link recordAudit}. Per-user translation overrides are never
 * modified here.
 */

import { recordAudit } from "./admin.service.js";

// Default native language for the translation cell, per FR-21.
const DEFAULT_NATIVE_LANGUAGE = "English";
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

function normaliseNative(nativeLanguage) {
  const value = typeof nativeLanguage === "string" ? nativeLanguage.trim() : "";
  return value || DEFAULT_NATIVE_LANGUAGE;
}

/**
 * List the global source languages available to the admin Words panel (those
 * that contain at least one word).
 * @param {object} repositories
 * @param {object} adminWords - The admin-words repository.
 * @returns {Promise<Array<{ id: number, name: string }>>}
 */
export async function listAdminSourceLanguages(repositories, adminWords) {
  return adminWords.listSourceLanguages();
}

/**
 * Return one keyset page of words in a single source language, each carrying the
 * canonical translation cell for the selected native language (empty when no
 * translation exists). Results are alphabetical by lemma; an opaque `nextCursor`
 * is returned when more rows remain, otherwise `null`.
 *
 * @param {object} repositories
 * @param {object} adminWords - The admin-words repository.
 * @param {object} params
 * @param {number} params.languageId - Source language id (required).
 * @param {string} [params.nativeLanguage] - Native language for the translation cell; defaults to English.
 * @param {string} [params.search] - Optional word/lemma substring filter.
 * @param {string|null} [params.cursor] - Opaque cursor from a previous page, or null/undefined for the first page.
 * @param {number} [params.limit] - Page size (clamped to {@link MAX_PAGE_SIZE}).
 * @returns {Promise<{ words: object[], nextCursor: string|null, nativeLanguage: string }
 *   | { error: string, status: number }>}
 */
export async function listAdminWords(repositories, adminWords, params) {
  const languageId = Number(params.languageId);
  if (!Number.isFinite(languageId)) {
    return { error: "Source language is required.", status: 400 };
  }
  const nativeLanguage = normaliseNative(params.nativeLanguage);
  const search = typeof params.search === "string" ? params.search.trim() : "";
  const limit = Math.min(Math.max(Number(params.limit) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const cursor = decodeCursor(params.cursor);

  const rows = await adminWords.listWordsPage(languageId, nativeLanguage, search, cursor, limit + 1);
  const hasMore = rows.length > limit;
  const words = hasMore ? rows.slice(0, limit) : rows;
  const last = words[words.length - 1];
  return {
    words,
    nextCursor: hasMore && last ? encodeCursor({ lemma: String(last.lemma || "").toLowerCase(), id: last.id }) : null,
    nativeLanguage
  };
}

/**
 * Insert or update the shared canonical translation for a (word, native
 * language) pair, then write an audit entry capturing the before/after value.
 * Only the shared `word_translations` row is changed; user-private overrides are
 * untouched, so users without an override see the new value while users with an
 * override keep theirs.
 *
 * @param {object} repositories
 * @param {object} adminWords - The admin-words repository.
 * @param {{ userId: number }} actor - The acting admin.
 * @param {number|string} wordId
 * @param {string} nativeLanguage - Native language whose canonical cell is edited; defaults to English.
 * @param {string} translation - New canonical translation (trimmed; empty clears the cell).
 * @returns {Promise<{ word: object } | { error: string, status: number }>}
 */
export async function upsertCanonicalTranslation(repositories, adminWords, actor, wordId, nativeLanguage, translation) {
  const id = Number(wordId);
  if (!Number.isFinite(id)) {
    return { error: "Word not found.", status: 404 };
  }
  const word = await adminWords.findWordById(id);
  if (!word) {
    return { error: "Word not found.", status: 404 };
  }
  const native = normaliseNative(nativeLanguage);
  const next = typeof translation === "string" ? translation.trim() : "";
  const previous = (await adminWords.findCanonicalTranslation(id, native))?.translation ?? null;

  await adminWords.upsertCanonicalTranslation(id, native, next);

  await recordAudit(
    repositories,
    actor,
    "word.setCanonicalTranslation",
    `word:${id}:${native}`,
    { wordId: id, nativeLanguage: native, translation: previous },
    { wordId: id, nativeLanguage: native, translation: next }
  );

  return {
    word: { id: word.id, word: word.word, lemma: word.lemma, canonicalTranslation: next }
  };
}

// Cursors are an opaque base64 of the (lemma, id) keyset position. Encoding keeps
// the client from depending on the internal ordering shape.
function encodeCursor(cursor) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeCursor(raw) {
  if (typeof raw !== "string" || !raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (typeof parsed?.lemma === "string" && Number.isFinite(Number(parsed?.id))) {
      return { lemma: parsed.lemma, id: Number(parsed.id) };
    }
  } catch {
    return null;
  }
  return null;
}

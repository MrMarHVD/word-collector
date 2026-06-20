/**
 * @fileoverview Admin-words repository. SQL persistence for the admin "Words"
 * panel (issue ADM-003). It reads the global word catalogue scoped to a single
 * source language with keyset pagination and word/lemma search, and upserts the
 * shared canonical translation for a (word_id, native_language) pair in
 * `word_translations`. Per-user `user_words.translation_override` rows are never
 * touched here — admin edits change only the shared canonical value.
 */

// The lemma key that identifies a global word within its language. Mirrors the
// unique index from migration 1748000000007 and the words-repository key, and is
// the alphabetical sort/keyset column for the admin listing.
const WORD_KEY = "lower(COALESCE(NULLIF(btrim(w.lemma), ''), w.word))";

/**
 * Build the admin-words repository bound to the given database executor.
 *
 * @param {object} db - Prepared-statement executor (same interface as the other repositories).
 * @returns {object} Repository with admin word/translation read and upsert methods.
 */
export function createAdminWordsRepository(db) {
  // Distinct global source languages that actually contain words, so the picker
  // never offers an empty language.
  const sourceLanguages = db.prepare(`
    SELECT l.id, l.name
    FROM languages l
    WHERE EXISTS (SELECT 1 FROM words w WHERE w.language_id = l.id)
    ORDER BY lower(l.name)
  `);

  // Columns shared by both listing variants. The canonical cell is the shared
  // word_translations row for the selected native language (NULL/'' when absent,
  // surfaced as an empty editable cell by the UI).
  const listColumns = `
    w.id,
    w.word,
    COALESCE(NULLIF(btrim(w.lemma), ''), w.word) AS lemma,
    COALESCE(wt.translation, '') AS "canonicalTranslation"`;
  const listFrom = `
    FROM words w
    LEFT JOIN word_translations wt ON wt.word_id = w.id AND wt.native_language = ?`;
  // Keyset order: alphabetical by lemma key, id as a stable tie-breaker.
  const listOrder = `ORDER BY ${WORD_KEY} ASC, w.id ASC`;

  const listFirstPage = db.prepare(`
    SELECT ${listColumns} ${listFrom}
    WHERE w.language_id = ?
    ${listOrder}
    LIMIT ?
  `);
  const listFirstPageSearch = db.prepare(`
    SELECT ${listColumns} ${listFrom}
    WHERE w.language_id = ?
      AND (lower(w.word) LIKE lower(?) OR ${WORD_KEY} LIKE lower(?))
    ${listOrder}
    LIMIT ?
  `);
  // Keyset continuation: rows strictly after the (lemmaKey, id) cursor.
  const listAfter = db.prepare(`
    SELECT ${listColumns} ${listFrom}
    WHERE w.language_id = ?
      AND (${WORD_KEY} > ? OR (${WORD_KEY} = ? AND w.id > ?))
    ${listOrder}
    LIMIT ?
  `);
  const listAfterSearch = db.prepare(`
    SELECT ${listColumns} ${listFrom}
    WHERE w.language_id = ?
      AND (lower(w.word) LIKE lower(?) OR ${WORD_KEY} LIKE lower(?))
      AND (${WORD_KEY} > ? OR (${WORD_KEY} = ? AND w.id > ?))
    ${listOrder}
    LIMIT ?
  `);

  const wordById = db.prepare(`
    SELECT w.id, w.word, w.language_id AS "languageId", l.name AS "languageName",
           COALESCE(NULLIF(btrim(w.lemma), ''), w.word) AS lemma
    FROM words w
    JOIN languages l ON l.id = w.language_id
    WHERE w.id = ?
  `);
  const canonicalTranslation = db.prepare(`
    SELECT translation FROM word_translations WHERE word_id = ? AND native_language = ?
  `);
  // Shared canonical upsert. Never touches user_words.translation_override.
  const upsertTranslation = db.prepare(`
    INSERT INTO word_translations (word_id, native_language, translation, updated_at)
    VALUES (?, ?, ?, now())
    ON CONFLICT (word_id, native_language)
    DO UPDATE SET translation = EXCLUDED.translation, updated_at = now()
  `);

  return {
    /**
     * List the global source languages that contain at least one word.
     * Queries: `languages`, `words`.
     * @returns {Promise<Array<{ id: number, name: string }>>}
     */
    listSourceLanguages() {
      return sourceLanguages.all();
    },
    /**
     * Return a keyset page of global words in a single source language, with the
     * canonical translation cell for the selected native language. ALL words in
     * the language are returned regardless of whether a translation exists; an
     * absent translation yields an empty `canonicalTranslation`. Ordered
     * alphabetically by lemma key (id as tie-breaker). Optional case-insensitive
     * substring search on the word surface or lemma.
     * Queries: `words` LEFT JOIN `word_translations`.
     * @param {number} languageId
     * @param {string} nativeLanguage
     * @param {string} search - Trimmed search term; empty string disables search.
     * @param {{ lemma: string, id: number }|null} cursor - Keyset cursor, or null for the first page.
     * @param {number} limit
     * @returns {Promise<Array<{ id: number, word: string, lemma: string, canonicalTranslation: string }>>}
     */
    listWordsPage(languageId, nativeLanguage, search, cursor, limit) {
      const pattern = search ? `%${search}%` : null;
      if (cursor) {
        if (pattern) {
          return listAfterSearch.all(
            nativeLanguage, languageId, pattern, pattern, cursor.lemma, cursor.lemma, cursor.id, limit
          );
        }
        return listAfter.all(nativeLanguage, languageId, cursor.lemma, cursor.lemma, cursor.id, limit);
      }
      if (pattern) {
        return listFirstPageSearch.all(nativeLanguage, languageId, pattern, pattern, limit);
      }
      return listFirstPage.all(nativeLanguage, languageId, limit);
    },
    /**
     * Find a global word by id with its language, surface, and lemma.
     * Queries: `words` JOIN `languages`.
     * @param {number} wordId
     * @returns {Promise<object|undefined>}
     */
    findWordById(wordId) {
      return wordById.get(wordId);
    },
    /**
     * Read the current shared canonical translation for a (word, native language)
     * pair, or `undefined` when no row exists.
     * Queries: `word_translations`.
     * @param {number} wordId
     * @param {string} nativeLanguage
     * @returns {Promise<{ translation: string }|undefined>}
     */
    findCanonicalTranslation(wordId, nativeLanguage) {
      return canonicalTranslation.get(wordId, nativeLanguage);
    },
    /**
     * Insert or update the shared canonical translation for a (word, native
     * language) pair. Per-user overrides are never affected.
     * Inserts/Updates: `word_translations`.
     * @param {number} wordId
     * @param {string} nativeLanguage
     * @param {string} translation
     * @returns {Promise<object>} Run result.
     */
    upsertCanonicalTranslation(wordId, nativeLanguage, translation) {
      return upsertTranslation.run(wordId, nativeLanguage, translation);
    }
  };
}

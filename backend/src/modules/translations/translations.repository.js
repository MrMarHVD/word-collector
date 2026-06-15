/**
 * @fileoverview Translations repository. Persistence for the shared
 * `word_translations` cache that stores one translation per (word, native
 * language) pair, and for the material-level translation status aggregations.
 * Tables: `word_translations`, `material_tokens`.
 */

/**
 * Build the translations repository bound to the given database executor.
 *
 * @param {object} db - Prepared-statement executor.
 * @returns {object} Repository with translation read/write and status methods.
 */
export function createTranslationsRepository(db) {
  const wordTranslation = db.prepare("SELECT translation FROM word_translations WHERE word_id = ? AND native_language = ?");
  const upsertWordTranslation = db.prepare(`
    INSERT INTO word_translations (word_id, native_language, translation, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(word_id, native_language) DO UPDATE SET translation = excluded.translation, updated_at = CURRENT_TIMESTAMP
  `);
  const wordTranslationsForWords = db.prepare(`
    SELECT word_id AS "wordId", translation
    FROM word_translations
    WHERE native_language = ? AND word_id = ANY(?::int[])
  `);
  const materialTranslationTokens = db.prepare(`
    SELECT mt.word_id AS "wordId", mt.surface, mt.lemma
    FROM material_tokens mt
    WHERE mt.material_id = ?
    ORDER BY mt.position
  `);
  const materialTranslationStatus = db.prepare(`
    SELECT COUNT(DISTINCT mt.word_id) AS "totalWords",
           COUNT(DISTINCT wt.word_id) AS "completedWords"
    FROM material_tokens mt
    LEFT JOIN word_translations wt ON wt.word_id = mt.word_id AND wt.native_language = ?
    WHERE mt.material_id = ?
  `);

  return {
    /**
     * Look up the stored translation for a single word/language pair.
     * Queries: `word_translations`.
     * @param {number} wordId
     * @param {string} nativeLanguage
     * @returns {object|undefined} Row with `translation`, or undefined when absent.
     */
    findWordTranslation(wordId, nativeLanguage) {
      return wordTranslation.get(wordId, nativeLanguage);
    },
    /**
     * Batch-fetch stored translations for multiple word ids in one language.
     * Queries: `word_translations`.
     * @param {string} nativeLanguage
     * @param {number[]} wordIds
     * @returns {object[]} Rows with `wordId` and `translation`.
     */
    listWordTranslationsForWords(nativeLanguage, wordIds) {
      return wordTranslationsForWords.all(nativeLanguage, wordIds);
    },
    /**
     * Insert or update a translation in the shared cache.
     * Upserts into: `word_translations`.
     * @param {number} wordId
     * @param {string} nativeLanguage
     * @param {string} translation
     * @returns {object} SQLite run result.
     */
    upsertWordTranslation(wordId, nativeLanguage, translation) {
      return upsertWordTranslation.run(wordId, nativeLanguage, translation);
    },
    /**
     * Return the minimal token set (wordId, surface, lemma) for all tokens in
     * a material, used by the translation backfill scan.
     * Queries: `material_tokens`.
     * @param {number} materialId
     * @returns {object[]}
     */
    listMaterialTranslationTokens(materialId) {
      return materialTranslationTokens.all(materialId);
    },
    /**
     * Return aggregate translation completion counts for a material in a target
     * language: total distinct word ids and how many have a translation row.
     * Queries: `material_tokens` LEFT JOIN `word_translations`.
     * @param {string} targetLanguage
     * @param {number} materialId
     * @returns {object} Row with `totalWords` and `completedWords`.
     */
    getMaterialTranslationStatus(targetLanguage, materialId) {
      return materialTranslationStatus.get(targetLanguage, materialId);
    }
  };
}

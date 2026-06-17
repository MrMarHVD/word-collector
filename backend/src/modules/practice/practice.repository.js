/**
 * @fileoverview Practice repository. Queries the `words` and `user_words`
 * tables to fetch the learning words that seed a practice session. Translation
 * priority mirrors the vocabulary list: user override → native-language cache
 * → source word / English gloss. Tables: `words`, `user_words`, `languages`,
 * `word_translations`.
 */

// Displayed translation mirrors the vocabulary list: prefer the user's own
// override, then their native-language translation, then the source word or its
// English gloss.
function displayedTranslationExpression() {
  return `
    CASE
      WHEN uw.translation_override IS NOT NULL AND btrim(uw.translation_override) <> '' THEN uw.translation_override
      WHEN wt.translation IS NOT NULL AND trim(wt.translation) <> '' THEN wt.translation
      WHEN lower(?) = lower(l.name) THEN w.word
      WHEN ? = 'English' THEN w.translation
      ELSE ''
    END
  `;
}

/**
 * Build the practice repository bound to the given database executor.
 *
 * @param {object} db - Prepared-statement executor.
 * @returns {object} Repository with learning-word query methods.
 */
export function createPracticeRepository(db) {
  return {
    /**
     * Return all words the user is currently learning in a language, ordered
     * by `click_count` descending then alphabetically. Click count drives
     * session word selection in the service layer.
     * Queries: `words` JOIN `user_words` JOIN `languages`
     * LEFT JOIN `word_translations`.
     * @param {number} userId
     * @param {number} languageId
     * @param {string} [nativeLanguage="English"]
     * @returns {object[]} Rows with `wordId`, `word`, `lemma`, `translation`,
     *   `reading`, `pinyin`, `clickCount`.
     */
    listLearningWords(userId, languageId, nativeLanguage = "English") {
      const translationExpression = displayedTranslationExpression();
      return db.prepare(`
        SELECT
          w.id AS "wordId",
          w.word,
          COALESCE(NULLIF(btrim(w.lemma), ''), w.word) AS lemma,
          ${translationExpression} AS translation,
          w.reading,
          w.pinyin,
          uw.click_count AS "clickCount"
        FROM words w
        JOIN user_words uw ON uw.word_id = w.id AND uw.user_id = ?
        JOIN languages l ON l.id = w.language_id
        LEFT JOIN word_translations wt ON wt.word_id = w.id AND wt.native_language = ?
        WHERE w.language_id = ? AND uw.status = 'learning'
        ORDER BY uw.click_count DESC, lower(w.word)
      `).all(nativeLanguage, nativeLanguage, userId, nativeLanguage, languageId);
    },
    /**
     * Return the subset of learning words the user has explicitly flagged with
     * `want_to_practice = 1`, ordered alphabetically.
     * Queries: `words` JOIN `user_words` JOIN `languages`
     * LEFT JOIN `word_translations`.
     * @param {number} userId
     * @param {number} languageId
     * @param {string} [nativeLanguage="English"]
     * @returns {object[]}
     */
    listWantToPracticeWords(userId, languageId, nativeLanguage = "English") {
      const translationExpression = displayedTranslationExpression();
      return db.prepare(`
        SELECT
          w.id AS "wordId",
          w.word,
          COALESCE(NULLIF(btrim(w.lemma), ''), w.word) AS lemma,
          ${translationExpression} AS translation,
          w.reading,
          w.pinyin,
          uw.click_count AS "clickCount"
        FROM words w
        JOIN user_words uw ON uw.word_id = w.id AND uw.user_id = ?
        JOIN languages l ON l.id = w.language_id
        LEFT JOIN word_translations wt ON wt.word_id = w.id AND wt.native_language = ?
        WHERE w.language_id = ? AND uw.status = 'learning' AND uw.want_to_practice = 1
        ORDER BY lower(w.word)
      `).all(nativeLanguage, nativeLanguage, userId, nativeLanguage, languageId);
    }
  };
}

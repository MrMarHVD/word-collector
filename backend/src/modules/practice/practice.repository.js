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

export function createPracticeRepository(db) {
  return {
    // Every word the user is currently learning in a language, ordered by how
    // many times its info pane has been opened (most-clicked first).
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
    // Learning words the user has explicitly marked as "want to practice". These
    // are chosen by the user rather than inferred from click activity.
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

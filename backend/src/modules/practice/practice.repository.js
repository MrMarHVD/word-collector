// Displayed translation mirrors the vocabulary list: prefer the user's
// native-language translation, then fall back to the source word or its
// English gloss.
function displayedTranslationExpression() {
  return `
    CASE
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
          COALESCE(w.lemma, w.word) AS lemma,
          ${translationExpression} AS translation,
          w.reading,
          w.pinyin,
          uws.click_count AS "clickCount"
        FROM words w
        JOIN collections c ON c.id = w.collection_id
        JOIN languages l ON l.id = c.language_id
        JOIN user_word_status uws ON uws.word_id = w.id AND uws.user_id = ?
        LEFT JOIN word_translations wt ON wt.word_id = w.id AND wt.native_language = ?
        WHERE l.user_id = ? AND l.id = ? AND uws.status = 'learning'
        ORDER BY uws.click_count DESC, lower(w.word)
      `).all(nativeLanguage, nativeLanguage, userId, nativeLanguage, userId, languageId);
    },
    // Learning words the user has explicitly marked as "want to practice". These
    // are chosen by the user rather than inferred from click activity.
    listWantToPracticeWords(userId, languageId, nativeLanguage = "English") {
      const translationExpression = displayedTranslationExpression();
      return db.prepare(`
        SELECT
          w.id AS "wordId",
          w.word,
          COALESCE(w.lemma, w.word) AS lemma,
          ${translationExpression} AS translation,
          w.reading,
          w.pinyin,
          uws.click_count AS "clickCount"
        FROM words w
        JOIN collections c ON c.id = w.collection_id
        JOIN languages l ON l.id = c.language_id
        JOIN user_word_status uws ON uws.word_id = w.id AND uws.user_id = ?
        LEFT JOIN word_translations wt ON wt.word_id = w.id AND wt.native_language = ?
        WHERE l.user_id = ? AND l.id = ? AND uws.status = 'learning' AND uws.want_to_practice = 1
        ORDER BY lower(w.word)
      `).all(nativeLanguage, nativeLanguage, userId, nativeLanguage, userId, languageId);
    }
  };
}

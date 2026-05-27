import { normalizeName } from "../shared/normalize.js";

// Collection word reads always join through language ownership.
function displayedTranslationExpression() {
  return `
    CASE
      WHEN wt.translation IS NOT NULL AND trim(wt.translation) <> '' THEN wt.translation
      WHEN ? = 'English' THEN w.translation
      ELSE ''
    END
  `;
}

// Return words for a collection with optional word or displayed-translation search.
export function getWords(db, userId, collectionId, search, nativeLanguage = "English") {
  const term = normalizeName(search);
  const translationExpression = displayedTranslationExpression();
  const selectColumns = `w.id, w.collection_id AS collectionId, w.word, ${translationExpression} AS translation,
    w.pos, w.pos_subcategory AS posSubcategory, w.reading, w.pinyin, w.traditional,
    COALESCE(uws.known, 0) AS known`;
  if (term) {
    return db.prepare(`
      SELECT ${selectColumns}
      FROM words w
      JOIN collections c ON c.id = w.collection_id
      JOIN languages l ON l.id = c.language_id
      LEFT JOIN word_translations wt ON wt.word_id = w.id AND wt.native_language = ?
      LEFT JOIN user_word_status uws ON uws.word_id = w.id AND uws.user_id = ?
      WHERE l.user_id = ? AND w.collection_id = ?
        AND (lower(w.word) LIKE lower(?) OR lower(${translationExpression}) LIKE lower(?))
      ORDER BY lower(w.word), lower(${translationExpression})
    `).all(nativeLanguage, nativeLanguage, userId, userId, collectionId, `%${term}%`, nativeLanguage, `%${term}%`, nativeLanguage);
  }

  return db.prepare(`
    SELECT ${selectColumns}
    FROM words w
    JOIN collections c ON c.id = w.collection_id
    JOIN languages l ON l.id = c.language_id
    LEFT JOIN word_translations wt ON wt.word_id = w.id AND wt.native_language = ?
    LEFT JOIN user_word_status uws ON uws.word_id = w.id AND uws.user_id = ?
    WHERE l.user_id = ? AND w.collection_id = ?
    ORDER BY lower(w.word), lower(${translationExpression})
  `).all(nativeLanguage, nativeLanguage, userId, userId, collectionId, nativeLanguage);
}

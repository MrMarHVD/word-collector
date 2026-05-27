function displayedTranslationExpression() {
  return `
    CASE
      WHEN wt.translation IS NOT NULL AND trim(wt.translation) <> '' THEN wt.translation
      WHEN ? = 'English' THEN w.translation
      ELSE ''
    END
  `;
}

export function createWordsRepository(db) {
  const collectionByName = db.prepare(`
    SELECT c.id, c.name, c.language_id AS languageId, l.name AS languageName
    FROM collections c
    JOIN languages l ON l.id = c.language_id
    WHERE l.user_id = ? AND c.language_id = ? AND lower(c.name) = lower(?)
  `);
  const collectionById = db.prepare(`
    SELECT c.id, c.name, c.language_id AS languageId, l.name AS languageName
    FROM collections c
    JOIN languages l ON l.id = c.language_id
    WHERE c.id = ? AND l.user_id = ?
  `);
  const createCollection = db.prepare("INSERT INTO collections (language_id, name) VALUES (?, ?)");
  const deleteCollection = db.prepare("DELETE FROM collections WHERE id = ?");
  const updateCollectionLanguage = db.prepare("UPDATE collections SET language_id = ? WHERE id = ?");
  const updateWordCollection = db.prepare("UPDATE words SET collection_id = ? WHERE id = ?");
  const updateWordCollectionAndTranslation = db.prepare("UPDATE words SET collection_id = ?, translation = ? WHERE id = ?");
  const wordOwnedByUser = db.prepare(`
    SELECT w.id
    FROM words w
    JOIN collections c ON c.id = w.collection_id
    JOIN languages l ON l.id = c.language_id
    WHERE w.id = ? AND l.user_id = ?
  `);
  const insertWord = db.prepare(`
    INSERT INTO words (collection_id, word, translation, lemma, pos, pos_subcategory, reading, pinyin, traditional)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(collection_id, word, translation) DO NOTHING
  `);
  const updateWordMetadata = db.prepare(`
    UPDATE words
    SET pos = COALESCE(NULLIF(pos, ''), ?),
        pos_subcategory = COALESCE(NULLIF(pos_subcategory, ''), ?),
        reading = COALESCE(NULLIF(reading, ''), ?),
        pinyin = COALESCE(NULLIF(pinyin, ''), ?),
        traditional = COALESCE(NULLIF(traditional, ''), ?)
    WHERE id = ?
  `);
  const wordInLanguageBySurfaceOrLemma = db.prepare(`
    SELECT w.id, w.word, w.translation, w.lemma, w.pos, w.pos_subcategory AS posSubcategory, w.reading, w.pinyin, w.traditional, c.id AS collectionId, c.name AS collectionName
    FROM words w
    JOIN collections c ON c.id = w.collection_id
    JOIN languages l ON l.id = c.language_id
    WHERE l.user_id = ? AND l.id = ? AND (lower(w.word) = lower(?) OR lower(COALESCE(w.lemma, w.word)) = lower(?))
    ORDER BY CASE WHEN lower(c.name) = 'uncollected' THEN 1 ELSE 0 END,
             CASE WHEN lower(w.word) = lower(?) THEN 0 ELSE 1 END,
             lower(c.name)
    LIMIT 1
  `);
  const wordByCollectionAndLemma = db.prepare(`
    SELECT w.id, w.word, w.translation, w.lemma, w.pos, w.pos_subcategory AS posSubcategory, w.reading, w.pinyin, w.traditional
    FROM words w
    WHERE w.collection_id = ? AND lower(COALESCE(w.lemma, w.word)) = lower(?)
    LIMIT 1
  `);
  const wordById = db.prepare(`
    SELECT w.id, w.collection_id AS collectionId, w.word, w.translation, COALESCE(w.lemma, w.word) AS lemma,
           w.pos, w.pos_subcategory AS posSubcategory, w.reading, w.pinyin, w.traditional,
           COALESCE(uws.known, 0) AS known
    FROM words w
    JOIN collections c ON c.id = w.collection_id
    JOIN languages l ON l.id = c.language_id
    LEFT JOIN user_word_status uws ON uws.word_id = w.id AND uws.user_id = ?
    WHERE w.id = ? AND l.user_id = ?
  `);
  const upsertKnown = db.prepare(`
    INSERT INTO user_word_status (user_id, word_id, known, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id, word_id) DO UPDATE SET known = excluded.known, updated_at = CURRENT_TIMESTAMP
  `);

  return {
    findCollectionByName(userId, languageId, name) {
      return collectionByName.get(userId, languageId, name);
    },
    findCollectionById(collectionId, userId) {
      return collectionById.get(collectionId, userId);
    },
    createCollection(languageId, name) {
      return createCollection.run(languageId, name);
    },
    deleteCollection(collectionId) {
      return deleteCollection.run(collectionId);
    },
    updateCollectionLanguage(languageId, collectionId) {
      return updateCollectionLanguage.run(languageId, collectionId);
    },
    insertWord(collectionId, word, translation, lemma, pos = null, posSubcategory = null, reading = null, pinyin = null, traditional = null) {
      return insertWord.run(collectionId, word, translation, lemma, pos, posSubcategory, reading, pinyin, traditional);
    },
    updateWordMetadata(wordId, metadata) {
      return updateWordMetadata.run(metadata.pos, metadata.posSubcategory, metadata.reading, metadata.pinyin, metadata.traditional, wordId);
    },
    findWordInLanguageBySurfaceOrLemma(userId, languageId, surface, lemma) {
      return wordInLanguageBySurfaceOrLemma.get(userId, languageId, surface, lemma, surface);
    },
    findWordByCollectionAndLemma(collectionId, lemma) {
      return wordByCollectionAndLemma.get(collectionId, lemma);
    },
    findWordById(userId, wordId) {
      return wordById.get(userId, wordId, userId);
    },
    upsertKnown(userId, wordId, known) {
      return upsertKnown.run(userId, wordId, known);
    },
    updateWordCollection(wordId, collectionId) {
      return updateWordCollection.run(collectionId, wordId);
    },
    updateWordCollectionAndTranslation(wordId, collectionId, translation) {
      return updateWordCollectionAndTranslation.run(collectionId, translation, wordId);
    },
    wordOwnedByUser(userId, wordId) {
      return Boolean(wordOwnedByUser.get(wordId, userId));
    },
    listWordsInLanguage(userId, languageId, searchTerm, nativeLanguage = "English") {
      const translationExpression = displayedTranslationExpression();
      const selectColumns = `w.id, w.collection_id AS collectionId, c.name AS collectionName, w.word, ${translationExpression} AS translation,
        w.pos, w.pos_subcategory AS posSubcategory, w.reading, w.pinyin, w.traditional,
        COALESCE(uws.known, 0) AS known`;
      if (searchTerm) {
        return db.prepare(`
          SELECT ${selectColumns}
          FROM words w
          JOIN collections c ON c.id = w.collection_id
          JOIN languages l ON l.id = c.language_id
          LEFT JOIN word_translations wt ON wt.word_id = w.id AND wt.native_language = ?
          LEFT JOIN user_word_status uws ON uws.word_id = w.id AND uws.user_id = ?
          WHERE l.user_id = ? AND l.id = ?
            AND (lower(w.word) LIKE lower(?) OR lower(${translationExpression}) LIKE lower(?))
          ORDER BY lower(w.word), lower(${translationExpression})
        `).all(nativeLanguage, nativeLanguage, userId, userId, languageId, `%${searchTerm}%`, nativeLanguage, `%${searchTerm}%`, nativeLanguage);
      }

      return db.prepare(`
        SELECT ${selectColumns}
        FROM words w
        JOIN collections c ON c.id = w.collection_id
        JOIN languages l ON l.id = c.language_id
        LEFT JOIN word_translations wt ON wt.word_id = w.id AND wt.native_language = ?
        LEFT JOIN user_word_status uws ON uws.word_id = w.id AND uws.user_id = ?
        WHERE l.user_id = ? AND l.id = ?
        ORDER BY lower(w.word), lower(${translationExpression})
      `).all(nativeLanguage, nativeLanguage, userId, userId, languageId, nativeLanguage);
    },
    listWords(userId, collectionId, searchTerm, nativeLanguage = "English") {
      const translationExpression = displayedTranslationExpression();
      const selectColumns = `w.id, w.collection_id AS collectionId, w.word, ${translationExpression} AS translation,
        w.pos, w.pos_subcategory AS posSubcategory, w.reading, w.pinyin, w.traditional,
        COALESCE(uws.known, 0) AS known`;
      if (searchTerm) {
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
        `).all(nativeLanguage, nativeLanguage, userId, userId, collectionId, `%${searchTerm}%`, nativeLanguage, `%${searchTerm}%`, nativeLanguage);
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
  };
}

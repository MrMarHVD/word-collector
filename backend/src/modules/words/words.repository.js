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

export function createWordsRepository(db) {
  const collectionByName = db.prepare(`
    SELECT c.id, c.name, c.language_id AS "languageId", l.name AS "languageName"
    FROM collections c
    JOIN languages l ON l.id = c.language_id
    WHERE l.user_id = ? AND c.language_id = ? AND lower(c.name) = lower(?)
  `);
  const collectionById = db.prepare(`
    SELECT c.id, c.name, c.language_id AS "languageId", l.name AS "languageName"
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
  // Documents (materials) owned by the user that still reference any of the
  // given words via their tokens. Used to block deletion of in-use words.
  const materialsReferencingWords = db.prepare(`
    SELECT DISTINCT m.title
    FROM material_tokens mt
    JOIN materials m ON m.id = mt.material_id
    WHERE m.user_id = ? AND mt.word_id = ANY(?::int[])
    ORDER BY m.title
  `);
  const insertWord = db.prepare(`
    INSERT INTO words (collection_id, word, translation, lemma, pos, pos_subcategory, reading, pinyin, traditional)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(collection_id, word, translation) DO NOTHING
  `);
  const insertWordReturning = db.prepare(`
    INSERT INTO words (collection_id, word, translation, lemma, pos, pos_subcategory, reading, pinyin, traditional)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(collection_id, word, translation) DO NOTHING
    RETURNING id, word, translation, lemma, pos, pos_subcategory AS "posSubcategory", reading, pinyin, traditional
  `);
  const updateWordMetadata = db.prepare(`
    UPDATE words
    SET pos = CASE WHEN pos IS NULL OR trim(pos) = '' OR pos = 'unknown' THEN ? ELSE pos END,
        pos_subcategory = COALESCE(NULLIF(pos_subcategory, ''), ?),
        reading = COALESCE(NULLIF(reading, ''), ?),
        pinyin = COALESCE(NULLIF(pinyin, ''), ?),
        traditional = COALESCE(NULLIF(traditional, ''), ?)
    WHERE id = ?
  `);
  const wordInLanguageBySurfaceOrLemma = db.prepare(`
    SELECT w.id, w.word, w.translation, w.lemma, w.pos, w.pos_subcategory AS "posSubcategory", w.reading, w.pinyin, w.traditional, c.id AS "collectionId", c.name AS "collectionName"
    FROM words w
    JOIN collections c ON c.id = w.collection_id
    JOIN languages l ON l.id = c.language_id
    WHERE l.user_id = ? AND l.id = ? AND (lower(w.word) = lower(?) OR lower(COALESCE(w.lemma, w.word)) = lower(?))
    ORDER BY CASE WHEN lower(c.name) = 'uncollected' THEN 1 ELSE 0 END,
             CASE WHEN lower(w.word) = lower(?) THEN 0 ELSE 1 END,
             lower(c.name)
    LIMIT 1
  `);
  // Batched variant of the lookup above: returns every word in the language
  // matching any of the given surfaces (by word) or lemmas (by lemma). Callers
  // re-apply the single-row match preference in memory.
  const wordsInLanguageByTerms = db.prepare(`
    SELECT w.id, w.word, w.lemma, c.name AS "collectionName"
    FROM words w
    JOIN collections c ON c.id = w.collection_id
    JOIN languages l ON l.id = c.language_id
    WHERE l.user_id = ? AND l.id = ?
      AND (lower(w.word) = ANY(ARRAY(SELECT lower(unnest(?::text[]))))
        OR lower(COALESCE(w.lemma, w.word)) = ANY(ARRAY(SELECT lower(unnest(?::text[])))))
  `);
  const wordByCollectionAndLemma = db.prepare(`
    SELECT w.id, w.word, w.translation, w.lemma, w.pos, w.pos_subcategory AS "posSubcategory", w.reading, w.pinyin, w.traditional
    FROM words w
    WHERE w.collection_id = ? AND lower(COALESCE(w.lemma, w.word)) = lower(?)
    LIMIT 1
  `);
  const wordById = db.prepare(`
    SELECT w.id, w.collection_id AS "collectionId", w.word, w.translation, COALESCE(w.lemma, w.word) AS lemma,
           w.pos, w.pos_subcategory AS "posSubcategory", w.reading, w.pinyin, w.traditional,
           COALESCE(uws.status, 'unknown') AS status,
           COALESCE(uws.want_to_practice, 0) AS "wantToPractice"
    FROM words w
    JOIN collections c ON c.id = w.collection_id
    JOIN languages l ON l.id = c.language_id
    LEFT JOIN user_word_status uws ON uws.word_id = w.id AND uws.user_id = ?
    WHERE w.id = ? AND l.user_id = ?
  `);
  // Writes both status (canonical) and known (legacy) so older readers stay
  // correct. A word that leaves 'learning' also drops its practice mark, since
  // the flag is only meaningful for learning words.
  const upsertStatus = db.prepare(`
    INSERT INTO user_word_status (user_id, word_id, known, status, updated_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id, word_id) DO UPDATE SET
      known = excluded.known,
      status = excluded.status,
      want_to_practice = CASE WHEN excluded.status = 'learning' THEN user_word_status.want_to_practice ELSE 0 END,
      updated_at = CURRENT_TIMESTAMP
  `);
  // Sets the practice mark, but only for a word that is currently learning. A
  // word in any other status leaves no row updated, so the rule is enforced in
  // the database as well as the service.
  const setWantToPractice = db.prepare(`
    UPDATE user_word_status
    SET want_to_practice = ?, updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ? AND word_id = ? AND status = 'learning'
  `);
  // Records one info-pane open for a word without touching its learning status.
  const incrementClickCount = db.prepare(`
    INSERT INTO user_word_status (user_id, word_id, known, status, click_count, updated_at)
    VALUES (?, ?, 0, 'unknown', 1, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id, word_id) DO UPDATE SET click_count = user_word_status.click_count + 1, updated_at = CURRENT_TIMESTAMP
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
    // Insert-and-return in one round trip. Returns undefined when the unique
    // (collection_id, word, translation) constraint suppressed the insert.
    insertWordReturning(collectionId, word, translation, lemma, pos = null, posSubcategory = null, reading = null, pinyin = null, traditional = null) {
      return insertWordReturning.get(collectionId, word, translation, lemma, pos, posSubcategory, reading, pinyin, traditional);
    },
    updateWordMetadata(wordId, metadata) {
      return updateWordMetadata.run(metadata.pos, metadata.posSubcategory, metadata.reading, metadata.pinyin, metadata.traditional, wordId);
    },
    findWordInLanguageBySurfaceOrLemma(userId, languageId, surface, lemma) {
      return wordInLanguageBySurfaceOrLemma.get(userId, languageId, surface, lemma, surface);
    },
    findWordsInLanguageByTerms(userId, languageId, surfaces, lemmas) {
      return wordsInLanguageByTerms.all(userId, languageId, surfaces, lemmas);
    },
    findWordByCollectionAndLemma(collectionId, lemma) {
      return wordByCollectionAndLemma.get(collectionId, lemma);
    },
    findWordById(userId, wordId) {
      return wordById.get(userId, wordId, userId);
    },
    upsertStatus(userId, wordId, status) {
      const known = status === "known" ? 1 : 0;
      return upsertStatus.run(userId, wordId, known, status);
    },
    setWantToPractice(userId, wordId, wantToPractice) {
      return setWantToPractice.run(wantToPractice ? 1 : 0, userId, wordId);
    },
    incrementClickCount(userId, wordId) {
      return incrementClickCount.run(userId, wordId);
    },
    deleteWord(wordId) {
      return db.prepare("DELETE FROM words WHERE id = ?").run(wordId);
    },
    updateWordCollection(wordId, collectionId) {
      return updateWordCollection.run(collectionId, wordId);
    },
    updateWordCollectionAndTranslation(wordId, collectionId, translation) {
      return updateWordCollectionAndTranslation.run(collectionId, translation, wordId);
    },
    async wordOwnedByUser(userId, wordId) {
      return Boolean(await wordOwnedByUser.get(wordId, userId));
    },
    async listMaterialsReferencingWords(userId, wordIds) {
      if (!wordIds.length) {
        return [];
      }
      return (await materialsReferencingWords.all(userId, wordIds)).map((row) => row.title);
    },
    listWordsInLanguage(userId, languageId, searchTerm, nativeLanguage = "English") {
      const translationExpression = displayedTranslationExpression();
      const selectColumns = `w.id, w.collection_id AS "collectionId", c.name AS "collectionName", l.name AS "languageName", w.word, COALESCE(w.lemma, w.word) AS lemma, ${translationExpression} AS translation,
        w.pos, w.pos_subcategory AS "posSubcategory", w.reading, w.pinyin, w.traditional,
        COALESCE(uws.status, 'unknown') AS status`;
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
        `).all(nativeLanguage, nativeLanguage, nativeLanguage, userId, userId, languageId, `%${searchTerm}%`, nativeLanguage, nativeLanguage, `%${searchTerm}%`, nativeLanguage, nativeLanguage);
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
      `).all(nativeLanguage, nativeLanguage, nativeLanguage, userId, userId, languageId, nativeLanguage, nativeLanguage);
    },
    listWords(userId, collectionId, searchTerm, nativeLanguage = "English") {
      const translationExpression = displayedTranslationExpression();
      const selectColumns = `w.id, w.collection_id AS "collectionId", l.name AS "languageName", w.word, COALESCE(w.lemma, w.word) AS lemma, ${translationExpression} AS translation,
        w.pos, w.pos_subcategory AS "posSubcategory", w.reading, w.pinyin, w.traditional,
        COALESCE(uws.status, 'unknown') AS status`;
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
        `).all(nativeLanguage, nativeLanguage, nativeLanguage, userId, userId, collectionId, `%${searchTerm}%`, nativeLanguage, nativeLanguage, `%${searchTerm}%`, nativeLanguage, nativeLanguage);
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
      `).all(nativeLanguage, nativeLanguage, nativeLanguage, userId, userId, collectionId, nativeLanguage, nativeLanguage);
    }
  };
}

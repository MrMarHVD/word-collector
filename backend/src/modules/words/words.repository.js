// Displayed translation, in priority order: the user's own override, the shared
// native-language cache, then the source word or its English gloss.
function displayedTranslationExpression() {
  return `
    CASE
      WHEN uw.translation_override IS NOT NULL AND btrim(uw.translation_override) <> '' THEN uw.translation_override
      WHEN wt.translation IS NOT NULL AND btrim(wt.translation) <> '' THEN wt.translation
      WHEN lower(?) = lower(l.name) THEN w.word
      WHEN ? = 'English' THEN w.translation
      ELSE ''
    END
  `;
}

function canonicalTranslationExpression() {
  return `
    CASE
      WHEN w.translation IS NOT NULL AND btrim(w.translation) <> '' AND lower(w.translation) <> lower(w.word) THEN w.translation
      WHEN wt.translation IS NOT NULL AND btrim(wt.translation) <> '' THEN wt.translation
      ELSE w.translation
    END
  `;
}

// The lemma key that identifies a global word within its language. Mirrors the
// unique index created in the migration and the import-resolution key.
const WORD_KEY = "lower(COALESCE(NULLIF(btrim(w.lemma), ''), w.word))";

export function createWordsRepository(db) {
  const collectionByName = db.prepare(`
    SELECT c.id, c.name, c.language_id AS "languageId", l.name AS "languageName"
    FROM collections c
    JOIN languages l ON l.id = c.language_id
    WHERE c.user_id = ? AND c.language_id = ? AND lower(c.name) = lower(?)
  `);
  const collectionById = db.prepare(`
    SELECT c.id, c.name, c.language_id AS "languageId", l.name AS "languageName"
    FROM collections c
    JOIN languages l ON l.id = c.language_id
    WHERE c.id = ? AND c.user_id = ?
  `);
  const createCollection = db.prepare("INSERT INTO collections (user_id, language_id, name) VALUES (?, ?, ?)");
  const deleteCollection = db.prepare("DELETE FROM collections WHERE id = ?");
  const updateCollectionLanguage = db.prepare("UPDATE collections SET language_id = ? WHERE id = ?");

  // Words are global per language. Inserts are idempotent on the lemma key, so a
  // word another user already imported is reused rather than duplicated.
  const insertWord = db.prepare(`
    INSERT INTO words (language_id, word, translation, lemma, pos, pos_subcategory, reading, pinyin, traditional)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (language_id, (lower(COALESCE(NULLIF(btrim(lemma), ''), word)))) DO NOTHING
  `);
  const insertWordReturning = db.prepare(`
    INSERT INTO words (language_id, word, translation, lemma, pos, pos_subcategory, reading, pinyin, traditional)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (language_id, (lower(COALESCE(NULLIF(btrim(lemma), ''), word)))) DO NOTHING
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
  // Global lookup of a word by surface or lemma, preferring an exact surface
  // match. No user scoping: the word table is shared across users.
  const wordInLanguageBySurfaceOrLemma = db.prepare(`
    SELECT w.id, w.word, w.translation, w.lemma, w.pos, w.pos_subcategory AS "posSubcategory", w.reading, w.pinyin, w.traditional
    FROM words w
    WHERE w.language_id = ? AND (lower(w.word) = lower(?) OR ${WORD_KEY} = lower(?))
    ORDER BY CASE WHEN lower(w.word) = lower(?) THEN 0 ELSE 1 END, w.id
    LIMIT 1
  `);
  // Batched global lookup used to seed translation candidates.
  const wordsInLanguageByTerms = db.prepare(`
    SELECT w.id, w.word, w.lemma
    FROM words w
    WHERE w.language_id = ?
      AND (lower(w.word) = ANY(ARRAY(SELECT lower(unnest(?::text[]))))
        OR ${WORD_KEY} = ANY(ARRAY(SELECT lower(unnest(?::text[])))))
  `);
  const wordById = db.prepare(`
    SELECT w.id, uw.collection_id AS "collectionId", w.word, ${displayedTranslationExpression()} AS translation,
           ${canonicalTranslationExpression()} AS "canonicalTranslation", uw.translation_override AS "translationOverride",
           COALESCE(NULLIF(btrim(w.lemma), ''), w.word) AS lemma,
           w.pos, w.pos_subcategory AS "posSubcategory", w.reading, w.pinyin, w.traditional,
           COALESCE(uw.status, 'unknown') AS status,
           COALESCE(uw.want_to_practice, 0) AS "wantToPractice"
    FROM words w
    JOIN user_words uw ON uw.word_id = w.id AND uw.user_id = ?
    JOIN languages l ON l.id = w.language_id
    LEFT JOIN word_translations wt ON wt.word_id = w.id AND wt.native_language = ?
    WHERE w.id = ?
  `);

  // Membership: add a global word to a user's private list. Idempotent; the
  // first collection placement wins (re-imports keep the user's organization).
  const upsertUserWord = db.prepare(`
    INSERT INTO user_words (user_id, word_id, collection_id)
    VALUES (?, ?, ?)
    ON CONFLICT (user_id, word_id) DO NOTHING
  `);
  const userWordExists = db.prepare("SELECT 1 FROM user_words WHERE user_id = ? AND word_id = ?");
  const deleteUserWord = db.prepare("DELETE FROM user_words WHERE user_id = ? AND word_id = ?");
  const updateUserWordCollection = db.prepare("UPDATE user_words SET collection_id = ?, updated_at = now() WHERE user_id = ? AND word_id = ?");
  const setTranslationOverride = db.prepare("UPDATE user_words SET translation_override = ?, updated_at = now() WHERE user_id = ? AND word_id = ?");

  // Status writes operate on the membership row, which always exists for a word
  // the user can act on (it was added when the word entered their list). `known`
  // is kept for legacy readers. Leaving 'learning' clears the practice mark.
  const updateStatus = db.prepare(`
    UPDATE user_words
    SET known = ?, status = ?,
        want_to_practice = CASE WHEN ? = 'learning' THEN want_to_practice ELSE 0 END,
        updated_at = now()
    WHERE user_id = ? AND word_id = ?
  `);
  const setWantToPractice = db.prepare(`
    UPDATE user_words
    SET want_to_practice = ?, updated_at = now()
    WHERE user_id = ? AND word_id = ? AND status = 'learning'
  `);
  const incrementClickCount = db.prepare(`
    UPDATE user_words SET click_count = click_count + 1, updated_at = now()
    WHERE user_id = ? AND word_id = ?
  `);

  const materialsReferencingWords = db.prepare(`
    SELECT DISTINCT m.title
    FROM material_tokens mt
    JOIN materials m ON m.id = mt.material_id
    WHERE m.user_id = ? AND mt.word_id = ANY(?::int[])
    ORDER BY m.title
  `);

  // Shared FROM/JOIN tail for the two vocabulary listings. The user's
  // membership drives ownership; the collection and language come from it.
  const wordsListFrom = `
    FROM words w
    JOIN user_words uw ON uw.word_id = w.id AND uw.user_id = ?
    JOIN collections c ON c.id = uw.collection_id
    JOIN languages l ON l.id = w.language_id
    LEFT JOIN word_translations wt ON wt.word_id = w.id AND wt.native_language = ?`;

  function wordsListColumns(te) {
    return `w.id, uw.collection_id AS "collectionId", c.name AS "collectionName", l.name AS "languageName",
      w.word, COALESCE(NULLIF(btrim(w.lemma), ''), w.word) AS lemma, ${te} AS translation,
      ${canonicalTranslationExpression()} AS "canonicalTranslation", uw.translation_override AS "translationOverride",
      w.pos, w.pos_subcategory AS "posSubcategory", w.reading, w.pinyin, w.traditional,
      COALESCE(uw.status, 'unknown') AS status`;
  }

  // Run a vocabulary listing scoped either to a whole language or one
  // collection. Parameters are emitted in textual order of the placeholders.
  function listWordsScoped(userId, scopeColumn, scopeValue, searchTerm, nativeLanguage) {
    const te = displayedTranslationExpression();
    const head = `SELECT ${wordsListColumns(te)} ${wordsListFrom}`;
    if (searchTerm) {
      const pattern = `%${searchTerm}%`;
      return db.prepare(`
        ${head}
        WHERE ${scopeColumn} = ?
          AND (lower(w.word) LIKE lower(?) OR lower(${te}) LIKE lower(?))
        ORDER BY lower(w.word), lower(${te})
      `).all(
        nativeLanguage, nativeLanguage, // SELECT translation expression
        userId,                          // user_words membership
        nativeLanguage,                  // word_translations native language
        scopeValue,                      // scope (language or collection)
        pattern,                         // word LIKE
        nativeLanguage, nativeLanguage, pattern, // translation LIKE
        nativeLanguage, nativeLanguage   // ORDER BY translation expression
      );
    }
    return db.prepare(`
      ${head}
      WHERE ${scopeColumn} = ?
      ORDER BY lower(w.word), lower(${te})
    `).all(
      nativeLanguage, nativeLanguage, // SELECT translation expression
      userId,                          // user_words membership
      nativeLanguage,                  // word_translations native language
      scopeValue,                      // scope (language or collection)
      nativeLanguage, nativeLanguage   // ORDER BY translation expression
    );
  }

  return {
    findCollectionByName(userId, languageId, name) {
      return collectionByName.get(userId, languageId, name);
    },
    findCollectionById(collectionId, userId) {
      return collectionById.get(collectionId, userId);
    },
    createCollection(userId, languageId, name) {
      return createCollection.run(userId, languageId, name);
    },
    deleteCollection(collectionId) {
      return deleteCollection.run(collectionId);
    },
    updateCollectionLanguage(languageId, collectionId) {
      return updateCollectionLanguage.run(languageId, collectionId);
    },
    insertWord(languageId, word, translation, lemma, pos = null, posSubcategory = null, reading = null, pinyin = null, traditional = null) {
      return insertWord.run(languageId, word, translation, lemma, pos, posSubcategory, reading, pinyin, traditional);
    },
    // Insert-and-return in one round trip. Returns undefined when the unique
    // lemma key suppressed the insert (the word already exists for the language).
    insertWordReturning(languageId, word, translation, lemma, pos = null, posSubcategory = null, reading = null, pinyin = null, traditional = null) {
      return insertWordReturning.get(languageId, word, translation, lemma, pos, posSubcategory, reading, pinyin, traditional);
    },
    updateWordMetadata(wordId, metadata) {
      return updateWordMetadata.run(metadata.pos, metadata.posSubcategory, metadata.reading, metadata.pinyin, metadata.traditional, wordId);
    },
    findWordInLanguage(languageId, surface, lemma) {
      return wordInLanguageBySurfaceOrLemma.get(languageId, surface, lemma, surface);
    },
    findWordsInLanguageByTerms(languageId, surfaces, lemmas) {
      return wordsInLanguageByTerms.all(languageId, surfaces, lemmas);
    },
    findWordById(userId, wordId, nativeLanguage = "English") {
      return wordById.get(nativeLanguage, nativeLanguage, userId, nativeLanguage, wordId);
    },
    addUserWord(userId, wordId, collectionId) {
      return upsertUserWord.run(userId, wordId, collectionId);
    },
    async userHasWord(userId, wordId) {
      return Boolean(await userWordExists.get(userId, wordId));
    },
    removeUserWord(userId, wordId) {
      return deleteUserWord.run(userId, wordId);
    },
    updateWordCollection(userId, wordId, collectionId) {
      return updateUserWordCollection.run(collectionId, userId, wordId);
    },
    setTranslationOverride(userId, wordId, translation) {
      return setTranslationOverride.run(translation, userId, wordId);
    },
    upsertStatus(userId, wordId, status) {
      const known = status === "known" ? 1 : 0;
      return updateStatus.run(known, status, status, userId, wordId);
    },
    setWantToPractice(userId, wordId, wantToPractice) {
      return setWantToPractice.run(wantToPractice ? 1 : 0, userId, wordId);
    },
    incrementClickCount(userId, wordId) {
      return incrementClickCount.run(userId, wordId);
    },
    async listMaterialsReferencingWords(userId, wordIds) {
      if (!wordIds.length) {
        return [];
      }
      return (await materialsReferencingWords.all(userId, wordIds)).map((row) => row.title);
    },
    listWordsInLanguage(userId, languageId, searchTerm, nativeLanguage = "English") {
      return listWordsScoped(userId, "w.language_id", languageId, searchTerm, nativeLanguage);
    },
    listWords(userId, collectionId, searchTerm, nativeLanguage = "English") {
      return listWordsScoped(userId, "uw.collection_id", collectionId, searchTerm, nativeLanguage);
    }
  };
}

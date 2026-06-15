/**
 * @fileoverview Words repository. SQL persistence for the shared global word
 * catalogue (`words`) and user-scoped membership/status records
 * (`user_words`), plus collection management (`collections`). Words are
 * global per language; a user "has" a word through a `user_words` row that
 * carries status, translation override, and click count. Vocabulary listing
 * queries support both collection-scoped and language-scoped views with
 * optional word/translation substring search.
 */

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

/**
 * Build the words repository bound to the given database executor.
 *
 * @param {object} db - Prepared-statement executor.
 * @returns {object} Repository with word, user-word, and collection methods.
 */
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
    /**
     * Find a user-owned collection by language and name (case-insensitive).
     * Queries: `collections` JOIN `languages`.
     * @param {number} userId
     * @param {number} languageId
     * @param {string} name
     * @returns {object|undefined}
     */
    findCollectionByName(userId, languageId, name) {
      return collectionByName.get(userId, languageId, name);
    },
    /**
     * Find a user-owned collection by id.
     * Queries: `collections` JOIN `languages`.
     * @param {number} collectionId
     * @param {number} userId
     * @returns {object|undefined}
     */
    findCollectionById(collectionId, userId) {
      return collectionById.get(collectionId, userId);
    },
    /**
     * Create a new collection for a user and language.
     * Inserts into: `collections`.
     * @param {number} userId
     * @param {number} languageId
     * @param {string} name
     * @returns {object} SQLite run result.
     */
    createCollection(userId, languageId, name) {
      return createCollection.run(userId, languageId, name);
    },
    /**
     * Hard-delete a collection row.
     * Deletes from: `collections`.
     * @param {number} collectionId
     * @returns {object} SQLite run result.
     */
    deleteCollection(collectionId) {
      return deleteCollection.run(collectionId);
    },
    /**
     * Change the language of a collection (used when migrating words between languages).
     * Updates: `collections`.
     * @param {number} languageId
     * @param {number} collectionId
     * @returns {object} SQLite run result.
     */
    updateCollectionLanguage(languageId, collectionId) {
      return updateCollectionLanguage.run(languageId, collectionId);
    },
    /**
     * Insert a global word. Silently no-ops when the lemma key already exists
     * in the language.
     * Inserts into: `words`.
     * @param {number} languageId
     * @param {string} word
     * @param {string} translation
     * @param {string} lemma
     * @param {string|null} [pos]
     * @param {string|null} [posSubcategory]
     * @param {string|null} [reading]
     * @param {string|null} [pinyin]
     * @param {string|null} [traditional]
     * @returns {object} SQLite run result.
     */
    insertWord(languageId, word, translation, lemma, pos = null, posSubcategory = null, reading = null, pinyin = null, traditional = null) {
      return insertWord.run(languageId, word, translation, lemma, pos, posSubcategory, reading, pinyin, traditional);
    },
    /**
     * Insert a global word and return its row in one round trip. Returns
     * `undefined` when the unique lemma key suppressed the insert (word already
     * exists for this language).
     * Inserts into: `words`.
     * @param {number} languageId
     * @param {string} word
     * @param {string} translation
     * @param {string} lemma
     * @param {string|null} [pos]
     * @param {string|null} [posSubcategory]
     * @param {string|null} [reading]
     * @param {string|null} [pinyin]
     * @param {string|null} [traditional]
     * @returns {object|undefined}
     */
    insertWordReturning(languageId, word, translation, lemma, pos = null, posSubcategory = null, reading = null, pinyin = null, traditional = null) {
      return insertWordReturning.get(languageId, word, translation, lemma, pos, posSubcategory, reading, pinyin, traditional);
    },
    /**
     * Fill in missing POS, reading, pinyin, and traditional fields on a global
     * word. Existing non-empty values are never overwritten.
     * Updates: `words`.
     * @param {number} wordId
     * @param {{ pos: string, posSubcategory: string, reading: string, pinyin: string, traditional: string }} metadata
     * @returns {object} SQLite run result.
     */
    updateWordMetadata(wordId, metadata) {
      return updateWordMetadata.run(metadata.pos, metadata.posSubcategory, metadata.reading, metadata.pinyin, metadata.traditional, wordId);
    },
    /**
     * Find a global word by surface or lemma in a language. An exact surface
     * match takes priority over a lemma match.
     * Queries: `words`.
     * @param {number} languageId
     * @param {string} surface
     * @param {string} lemma
     * @returns {object|undefined}
     */
    findWordInLanguage(languageId, surface, lemma) {
      return wordInLanguageBySurfaceOrLemma.get(languageId, surface, lemma, surface);
    },
    /**
     * Batch-fetch global words matching any of the given surfaces or lemmas.
     * Used to seed translation candidates without per-token queries.
     * Queries: `words`.
     * @param {number} languageId
     * @param {string[]} surfaces
     * @param {string[]} lemmas
     * @returns {object[]}
     */
    findWordsInLanguageByTerms(languageId, surfaces, lemmas) {
      return wordsInLanguageByTerms.all(languageId, surfaces, lemmas);
    },
    /**
     * Find a word by id, scoped to the user's membership, with full display
     * fields including resolved translation, status, and collection.
     * Queries: `words` JOIN `user_words` JOIN `languages`
     * LEFT JOIN `word_translations`.
     * @param {number} userId
     * @param {number} wordId
     * @param {string} [nativeLanguage="English"]
     * @returns {object|undefined}
     */
    findWordById(userId, wordId, nativeLanguage = "English") {
      return wordById.get(nativeLanguage, nativeLanguage, userId, nativeLanguage, wordId);
    },
    /**
     * Add a global word to the user's private list in the given collection.
     * Idempotent: existing memberships are preserved without change.
     * Inserts into: `user_words`.
     * @param {number} userId
     * @param {number} wordId
     * @param {number} collectionId
     * @returns {object} SQLite run result.
     */
    addUserWord(userId, wordId, collectionId) {
      return upsertUserWord.run(userId, wordId, collectionId);
    },
    /**
     * Return `true` when the user has a membership row for the given word.
     * Queries: `user_words`.
     * @param {number} userId
     * @param {number} wordId
     * @returns {Promise<boolean>}
     */
    async userHasWord(userId, wordId) {
      return Boolean(await userWordExists.get(userId, wordId));
    },
    /**
     * Remove the user's membership for a word. The global word row is preserved.
     * Deletes from: `user_words`.
     * @param {number} userId
     * @param {number} wordId
     * @returns {object} SQLite run result.
     */
    removeUserWord(userId, wordId) {
      return deleteUserWord.run(userId, wordId);
    },
    /**
     * Move the user's word membership to a different collection.
     * Updates: `user_words`.
     * @param {number} userId
     * @param {number} wordId
     * @param {number} collectionId
     * @returns {object} SQLite run result.
     */
    updateWordCollection(userId, wordId, collectionId) {
      return updateUserWordCollection.run(collectionId, userId, wordId);
    },
    /**
     * Set or clear the user's personal translation override for a word.
     * Updates: `user_words`.
     * @param {number} userId
     * @param {number} wordId
     * @param {string|null} translation - `null` clears the override.
     * @returns {object} SQLite run result.
     */
    setTranslationOverride(userId, wordId, translation) {
      return setTranslationOverride.run(translation, userId, wordId);
    },
    /**
     * Set the learning status of a word. Moving away from `"learning"` also
     * clears the `want_to_practice` flag.
     * Updates: `user_words`.
     * @param {number} userId
     * @param {number} wordId
     * @param {"unknown"|"learning"|"known"} status
     * @returns {object} SQLite run result.
     */
    upsertStatus(userId, wordId, status) {
      const known = status === "known" ? 1 : 0;
      return updateStatus.run(known, status, status, userId, wordId);
    },
    /**
     * Set or clear the `want_to_practice` flag. The flag can only be turned
     * on when the word's status is already `"learning"` (enforced by the
     * service layer; the SQL itself does not re-check).
     * Updates: `user_words`.
     * @param {number} userId
     * @param {number} wordId
     * @param {boolean} wantToPractice
     * @returns {object} SQLite run result.
     */
    setWantToPractice(userId, wordId, wantToPractice) {
      return setWantToPractice.run(wantToPractice ? 1 : 0, userId, wordId);
    },
    /**
     * Atomically increment the info-pane click counter for a word.
     * Updates: `user_words`.
     * @param {number} userId
     * @param {number} wordId
     * @returns {object} SQLite run result.
     */
    incrementClickCount(userId, wordId) {
      return incrementClickCount.run(userId, wordId);
    },
    /**
     * Return the titles of all materials that reference any of the given word
     * ids via `material_tokens`. Used to block deletion of words still in use.
     * Queries: `material_tokens` JOIN `materials`.
     * @param {number} userId
     * @param {number[]} wordIds
     * @returns {Promise<string[]>} Sorted list of material titles.
     */
    async listMaterialsReferencingWords(userId, wordIds) {
      if (!wordIds.length) {
        return [];
      }
      return (await materialsReferencingWords.all(userId, wordIds)).map((row) => row.title);
    },
    /**
     * Return all words the user has in a language, with optional substring
     * search on word or displayed translation. Ordered alphabetically.
     * Queries: `words` JOIN `user_words` JOIN `collections` JOIN `languages`
     * LEFT JOIN `word_translations`.
     * @param {number} userId
     * @param {number} languageId
     * @param {string} searchTerm
     * @param {string} [nativeLanguage="English"]
     * @returns {object[]}
     */
    listWordsInLanguage(userId, languageId, searchTerm, nativeLanguage = "English") {
      return listWordsScoped(userId, "w.language_id", languageId, searchTerm, nativeLanguage);
    },
    /**
     * Return all words in a specific collection, with optional substring search.
     * Ordered alphabetically.
     * Queries: `words` JOIN `user_words` JOIN `collections` JOIN `languages`
     * LEFT JOIN `word_translations`.
     * @param {number} userId
     * @param {number} collectionId
     * @param {string} searchTerm
     * @param {string} [nativeLanguage="English"]
     * @returns {object[]}
     */
    listWords(userId, collectionId, searchTerm, nativeLanguage = "English") {
      return listWordsScoped(userId, "uw.collection_id", collectionId, searchTerm, nativeLanguage);
    }
  };
}

/**
 * @fileoverview Imports repository. A thin façade over the words and
 * translations repositories that exposes only the operations needed by the
 * CSV import flow. Delegates every query to those repositories rather than
 * owning prepared statements of its own.
 */

/**
 * Build the imports repository by wrapping a subset of the words and
 * translations repository methods under import-oriented names.
 *
 * @param {{ words: object, translations: object }} repositories - Sibling repositories.
 * @returns {object} Imports repository.
 */
export function createImportsRepository(repositories) {
  return {
    /**
     * Find a user-owned collection by name and language.
     * Delegates to: words repository `findCollectionByName`.
     * @param {number} userId
     * @param {number} languageId
     * @param {string} name
     * @returns {object|undefined}
     */
    findCollectionByName(userId, languageId, name) {
      return repositories.words.findCollectionByName(userId, languageId, name);
    },
    /**
     * Find a user-owned collection by id.
     * Delegates to: words repository `findCollectionById`.
     * @param {number} userId
     * @param {number} collectionId
     * @returns {object|undefined}
     */
    findCollectionById(userId, collectionId) {
      return repositories.words.findCollectionById(collectionId, userId);
    },
    /**
     * Create a new collection for a user and language.
     * Delegates to: words repository `createCollection`.
     * @param {number} userId
     * @param {number} languageId
     * @param {string} name
     * @returns {object} SQLite run result.
     */
    createCollection(userId, languageId, name) {
      return repositories.words.createCollection(userId, languageId, name);
    },
    /**
     * Look up the global word for a language by surface form (treated as both
     * surface and lemma key for CSV-imported words).
     * Delegates to: words repository `findWordInLanguage`.
     * @param {number} languageId
     * @param {string} surface
     * @returns {object|undefined}
     */
    findWordInLanguage(languageId, surface) {
      return repositories.words.findWordInLanguage(languageId, surface, surface);
    },
    /**
     * Insert a new global word and return its row. Falls back to a lookup when
     * a concurrent import created the same lemma first.
     * Delegates to: words repository `insertWordReturning` / `findWordInLanguage`.
     * @param {number} languageId
     * @param {string} word - Surface form; also used as the lemma key.
     * @param {string} translation
     * @returns {Promise<object|undefined>}
     */
    async insertWord(languageId, word, translation) {
      return (await repositories.words.insertWordReturning(languageId, word, translation, word))
        || (await repositories.words.findWordInLanguage(languageId, word, word));
    },
    /**
     * Add a global word to a user's private list in the given collection.
     * Idempotent; the first collection placement wins.
     * Delegates to: words repository `addUserWord`.
     * @param {number} userId
     * @param {number} wordId
     * @param {number} collectionId
     * @returns {object} SQLite run result.
     */
    addUserWord(userId, wordId, collectionId) {
      return repositories.words.addUserWord(userId, wordId, collectionId);
    },
    /**
     * Move an existing user-word membership to a different collection.
     * Delegates to: words repository `updateWordCollection`.
     * @param {number} userId
     * @param {number} wordId
     * @param {number} collectionId
     * @returns {object} SQLite run result.
     */
    moveUserWord(userId, wordId, collectionId) {
      return repositories.words.updateWordCollection(userId, wordId, collectionId);
    },
    /**
     * Set a user's personal translation override for a word (does not touch
     * the shared canonical translation).
     * Delegates to: words repository `setTranslationOverride`.
     * @param {number} userId
     * @param {number} wordId
     * @param {string} translation
     * @returns {object} SQLite run result.
     */
    setTranslationOverride(userId, wordId, translation) {
      return repositories.words.setTranslationOverride(userId, wordId, translation);
    },
    /**
     * Seed the shared English translation cache for a word only when it is
     * still empty; never overwrites an existing translation from another user.
     * Delegates to: translations repository `findWordTranslation` / `upsertWordTranslation`.
     * @param {number} wordId
     * @param {string} translation
     * @returns {Promise<void>}
     */
    async seedEnglishTranslation(wordId, translation) {
      const row = await repositories.translations.findWordTranslation(wordId, "English");
      if (!(row?.translation || "").trim()) {
        await repositories.translations.upsertWordTranslation(wordId, "English", translation);
      }
    }
  };
}

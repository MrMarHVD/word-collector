export function createImportsRepository(repositories) {
  return {
    findCollectionByName(userId, languageId, name) {
      return repositories.words.findCollectionByName(userId, languageId, name);
    },
    findCollectionById(userId, collectionId) {
      return repositories.words.findCollectionById(collectionId, userId);
    },
    createCollection(userId, languageId, name) {
      return repositories.words.createCollection(userId, languageId, name);
    },
    // Find the global word for this language by its surface/lemma.
    findWordInLanguage(languageId, surface) {
      return repositories.words.findWordInLanguage(languageId, surface, surface);
    },
    // Create the global word (lemma = the imported surface), tolerating a race
    // where another import created it first.
    async insertWord(languageId, word, translation) {
      return (await repositories.words.insertWordReturning(languageId, word, translation, word))
        || (await repositories.words.findWordInLanguage(languageId, word, word));
    },
    addUserWord(userId, wordId, collectionId) {
      return repositories.words.addUserWord(userId, wordId, collectionId);
    },
    moveUserWord(userId, wordId, collectionId) {
      return repositories.words.updateWordCollection(userId, wordId, collectionId);
    },
    // The imported translation is personal to the user.
    setTranslationOverride(userId, wordId, translation) {
      return repositories.words.setTranslationOverride(userId, wordId, translation);
    },
    // Seed the shared English cache only when it is still empty, so an import
    // never overwrites a translation other users already rely on.
    async seedEnglishTranslation(wordId, translation) {
      const row = await repositories.translations.findWordTranslation(wordId, "English");
      if (!(row?.translation || "").trim()) {
        await repositories.translations.upsertWordTranslation(wordId, "English", translation);
      }
    }
  };
}

export function createImportsRepository(repositories) {
  return {
    findCollectionByName(userId, languageId, name) {
      return repositories.words.findCollectionByName(userId, languageId, name);
    },
    findCollectionById(userId, collectionId) {
      return repositories.words.findCollectionById(collectionId, userId);
    },
    createCollection(languageId, name) {
      return repositories.words.createCollection(languageId, name);
    },
    insertWord(collectionId, word, translation) {
      return repositories.words.insertWord(collectionId, word, translation, word);
    },
    findWordByCollectionAndLemma(collectionId, lemma) {
      return repositories.words.findWordByCollectionAndLemma(collectionId, lemma);
    },
    findExistingWordInLanguage(userId, languageId, surface) {
      return repositories.words.findWordInLanguageBySurfaceOrLemma(userId, languageId, surface, surface);
    },
    moveAndUpdateWord(wordId, collectionId, translation) {
      return repositories.words.updateWordCollectionAndTranslation(wordId, collectionId, translation);
    },
    upsertEnglishTranslation(wordId, translation) {
      return repositories.translations.upsertWordTranslation(wordId, "English", translation);
    }
  };
}

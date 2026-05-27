export function createImportsRepository(repositories) {
  return {
    findCollectionByName(userId, languageId, name) {
      return repositories.words.findCollectionByName(userId, languageId, name);
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
    upsertEnglishTranslation(wordId, translation) {
      return repositories.translations.upsertWordTranslation(wordId, "English", translation);
    }
  };
}

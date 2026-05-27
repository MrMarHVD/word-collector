import { normalizeName } from "../../shared/normalize.js";
import { getLanguage } from "../languages/languages.service.js";

// CSV import creates the target collection if needed and skips duplicate rows.
// Validate imported rows and write them to a user-owned collection atomically.
export function importWords(repositories, userId, collectionName, languageId, words) {
  const name = normalizeName(collectionName);
  if (!name) {
    return { error: "Collection name is required." };
  }

  const language = getLanguage(repositories, userId, languageId);
  if (!language) {
    return { error: "Language is required." };
  }

  const cleanWords = Array.isArray(words)
    ? words
        .map((entry) => ({
          word: normalizeName(entry?.word),
          translation: normalizeName(entry?.translation)
        }))
        .filter((entry) => entry.word && entry.translation)
    : [];

  if (!cleanWords.length) {
    return { error: "Upload at least one row with a word and translation." };
  }

  let collection = repositories.imports.findCollectionByName(userId, language.id, name);
  if (!collection) {
    repositories.imports.createCollection(language.id, name);
    collection = repositories.imports.findCollectionByName(userId, language.id, name);
  }

  let inserted = 0;
  repositories.database.transaction(() => {
    // Keep each upload atomic so partial imports do not leave mixed results.
    for (const row of cleanWords) {
      const result = repositories.imports.insertWord(collection.id, row.word, row.translation);
      if (result.changes) {
        const word = repositories.imports.findWordByCollectionAndLemma(collection.id, row.word);
        if (word) {
          repositories.imports.upsertEnglishTranslation(word.id, row.translation);
        }
      }
      inserted += result.changes;
    }
  });

  return {
    collection,
    parsed: cleanWords.length,
    inserted,
    skipped: cleanWords.length - inserted
  };
}

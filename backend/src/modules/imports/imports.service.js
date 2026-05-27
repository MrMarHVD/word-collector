import { normalizeName } from "../../shared/normalize.js";
import { getLanguage } from "../languages/languages.service.js";

// CSV import targets either an existing collection (by id) or creates one by name.
// Validate imported rows and write them to a user-owned collection atomically.
export function importWords(repositories, userId, { collectionName, collectionId, languageId, words }) {
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

  let collection;
  if (collectionId) {
    collection = repositories.imports.findCollectionById(userId, Number(collectionId));
    if (!collection) {
      return { error: "Collection not found." };
    }
  } else {
    const name = normalizeName(collectionName);
    if (!name) {
      return { error: "Collection name is required." };
    }
    const language = getLanguage(repositories, userId, languageId);
    if (!language) {
      return { error: "Language is required." };
    }
    collection = repositories.imports.findCollectionByName(userId, language.id, name);
    if (!collection) {
      repositories.imports.createCollection(language.id, name);
      collection = repositories.imports.findCollectionByName(userId, language.id, name);
    }
  }

  let inserted = 0;
  let skipped = 0;
  repositories.database.transaction(() => {
    // Keep each upload atomic so partial imports do not leave mixed results.
    for (const row of cleanWords) {
      // If the word already exists anywhere in this language, move it to the
      // target collection and update its translation to the imported value.
      const existing = repositories.imports.findExistingWordInLanguage(userId, collection.languageId, row.word);
      if (existing) {
        try {
          repositories.imports.moveAndUpdateWord(existing.id, collection.id, row.translation);
          repositories.imports.upsertEnglishTranslation(existing.id, row.translation);
          inserted += 1;
        } catch {
          skipped += 1;
        }
        continue;
      }

      const result = repositories.imports.insertWord(collection.id, row.word, row.translation);
      if (result.changes) {
        const word = repositories.imports.findWordByCollectionAndLemma(collection.id, row.word);
        if (word) {
          repositories.imports.upsertEnglishTranslation(word.id, row.translation);
        }
        inserted += 1;
      } else {
        skipped += 1;
      }
    }
  });

  return {
    collection,
    parsed: cleanWords.length,
    inserted,
    skipped
  };
}

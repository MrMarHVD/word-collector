import { normalizeName } from "../../shared/normalize.js";
import { getLanguage } from "../languages/languages.service.js";

// CSV import targets either an existing collection (by id) or creates one by name.
// Validate imported rows and write them to a user-owned collection atomically.
export async function importWords(repositories, userId, { collectionName, collectionId, languageId, words }) {
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
    collection = await repositories.imports.findCollectionById(userId, Number(collectionId));
    if (!collection) {
      return { error: "Collection not found." };
    }
  } else {
    const name = normalizeName(collectionName);
    if (!name) {
      return { error: "Collection name is required." };
    }
    const language = await getLanguage(repositories, userId, languageId);
    if (!language) {
      return { error: "Language is required." };
    }
    collection = await repositories.imports.findCollectionByName(userId, language.id, name);
    if (!collection) {
      await repositories.imports.createCollection(language.id, name);
      collection = await repositories.imports.findCollectionByName(userId, language.id, name);
    }
  }

  let inserted = 0;
  let skipped = 0;
  await repositories.database.transaction(async (tx) => {
    // Keep each upload atomic so partial imports do not leave mixed results.
    for (const row of cleanWords) {
      // If the word already exists anywhere in this language, move it to the
      // target collection and update its translation to the imported value.
      const existing = await tx.imports.findExistingWordInLanguage(userId, collection.languageId, row.word);
      if (existing) {
        try {
          await tx.imports.moveAndUpdateWord(existing.id, collection.id, row.translation);
          await tx.imports.upsertEnglishTranslation(existing.id, row.translation);
          inserted += 1;
        } catch {
          skipped += 1;
        }
        continue;
      }

      const result = await tx.imports.insertWord(collection.id, row.word, row.translation);
      if (result.changes) {
        const word = await tx.imports.findWordByCollectionAndLemma(collection.id, row.word);
        if (word) {
          await tx.imports.upsertEnglishTranslation(word.id, row.translation);
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

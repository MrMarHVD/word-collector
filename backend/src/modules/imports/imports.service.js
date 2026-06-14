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
      await repositories.imports.createCollection(userId, language.id, name);
      collection = await repositories.imports.findCollectionByName(userId, language.id, name);
    }
  }

  let inserted = 0;
  let skipped = 0;
  await repositories.database.transaction(async (tx) => {
    // Keep each upload atomic so partial imports do not leave mixed results.
    for (const row of cleanWords) {
      // Reuse the shared global word for this language, creating it if the
      // language has never seen it.
      let word = await tx.imports.findWordInLanguage(collection.languageId, row.word);
      if (!word) {
        word = await tx.imports.insertWord(collection.languageId, row.word, row.translation);
      }
      if (!word) {
        skipped += 1;
        continue;
      }

      // Add the word to the user's list in the target collection, or move it
      // there if they already had it elsewhere.
      const added = await tx.imports.addUserWord(userId, word.id, collection.id);
      if (!added.changes) {
        await tx.imports.moveUserWord(userId, word.id, collection.id);
      }

      // The imported translation is the user's own; also seed the shared
      // English cache when empty so future imports of this word inherit it.
      await tx.imports.setTranslationOverride(userId, word.id, row.translation);
      await tx.imports.seedEnglishTranslation(word.id, row.translation);
      inserted += 1;
    }
  });

  return {
    collection,
    parsed: cleanWords.length,
    inserted,
    skipped
  };
}

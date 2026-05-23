import { normalizeName } from "../shared/normalize.js";
import { getLanguage } from "./languages.js";

export function importWords(db, statements, userId, collectionName, languageId, words) {
  const name = normalizeName(collectionName);
  if (!name) {
    return { error: "Collection name is required." };
  }

  const language = getLanguage(statements, userId, languageId);
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

  let collection = statements.collectionByName.get(userId, language.id, name);
  if (!collection) {
    statements.createCollection.run(language.id, name);
    collection = statements.collectionByName.get(userId, language.id, name);
  }

  let inserted = 0;
  db.exec("BEGIN");
  try {
    for (const row of cleanWords) {
      const result = statements.insertWord.run(collection.id, row.word, row.translation, row.word);
      if (result.changes) {
        const word = statements.wordByCollectionAndLemma.get(collection.id, row.word);
        if (word) {
          statements.upsertWordTranslation.run(word.id, "English", row.translation);
        }
      }
      inserted += result.changes;
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return {
    collection,
    parsed: cleanWords.length,
    inserted,
    skipped: cleanWords.length - inserted
  };
}

import { normalizeName } from "../shared/normalize.js";
import { getOrCreateLanguage } from "./languages.js";

export function importWords(db, statements, userId, collectionName, languageName, languageId, words) {
  const name = normalizeName(collectionName);
  if (!name) {
    return { error: "Collection name is required." };
  }

  const language = getOrCreateLanguage(statements, userId, languageName, languageId);
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
      const result = statements.insertWord.run(collection.id, row.word, row.translation);
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

import { normalizeName } from "../../shared/normalize.js";
import { displayTranslationForToken, languageKey, translationDisambiguationCandidates } from "../translations/translations.service.js";

function withDisambiguation(repositories, nativeLanguage, words) {
  return words.map((word) => {
    const sourceLanguage = { name: word.languageName };
    const token = { surface: word.word, lemma: word.lemma || word.word, word: word.word };
    const disambiguationCandidates = translationDisambiguationCandidates(repositories, sourceLanguage, nativeLanguage, token);
    if (!disambiguationCandidates.length) {
      return word;
    }
    const translation = languageKey(sourceLanguage) === "English" && languageKey(nativeLanguage) === "Japanese"
      ? displayTranslationForToken(repositories, sourceLanguage, nativeLanguage, token) || word.translation
      : word.translation;
    return { ...word, translation, disambiguationCandidates };
  });
}

// Return words for a collection with optional word or displayed-translation search.
export function getWords(repositories, userId, collectionId, search, nativeLanguage = "English") {
  const term = normalizeName(search);
  return withDisambiguation(repositories, nativeLanguage, repositories.words.listWords(userId, collectionId, term, nativeLanguage));
}

// Return every word across all of the user's collections in a language.
export function getWordsInLanguage(repositories, userId, languageId, search, nativeLanguage = "English") {
  const term = normalizeName(search);
  return withDisambiguation(repositories, nativeLanguage, repositories.words.listWordsInLanguage(userId, languageId, term, nativeLanguage));
}

// Delete user-owned words. Ignores ids that don't belong to the user.
export function deleteWords(repositories, userId, wordIds) {
  const ids = Array.from(new Set((wordIds || []).map((id) => Number(id)).filter(Number.isFinite)));
  if (!ids.length) {
    return { error: "No words selected." };
  }

  let deleted = 0;
  let skipped = 0;
  repositories.database.transaction(() => {
    for (const id of ids) {
      if (!repositories.words.wordOwnedByUser(userId, id)) {
        skipped += 1;
        continue;
      }
      const result = repositories.words.deleteWord(id);
      if (result.changes) {
        deleted += 1;
      } else {
        skipped += 1;
      }
    }
  });

  return { deleted, skipped };
}

// Move user-owned words into a destination collection. Words that would collide
// with an existing (word, translation) row in the destination are skipped.
export function moveWords(repositories, userId, wordIds, collectionId) {
  const destination = repositories.words.findCollectionById(collectionId, userId);
  if (!destination) {
    return { error: "Collection not found." };
  }

  const ids = Array.from(new Set((wordIds || []).map((id) => Number(id)).filter(Number.isFinite)));
  if (!ids.length) {
    return { error: "No words selected." };
  }

  let moved = 0;
  let skipped = 0;
  repositories.database.transaction(() => {
    for (const id of ids) {
      if (!repositories.words.wordOwnedByUser(userId, id)) {
        skipped += 1;
        continue;
      }
      try {
        const result = repositories.words.updateWordCollection(id, destination.id);
        if (result.changes) {
          moved += 1;
        } else {
          skipped += 1;
        }
      } catch {
        skipped += 1;
      }
    }
  });

  return { collection: destination, moved, skipped };
}

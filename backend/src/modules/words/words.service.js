import { normalizeName } from "../../shared/normalize.js";
import { displayTranslationForToken, translationDisambiguationCandidates } from "../translations/translations.service.js";

async function withDisambiguation(repositories, nativeLanguage, words) {
  const result = [];
  for (const word of words) {
    const sourceLanguage = { name: word.languageName };
    const token = { surface: word.word, lemma: word.lemma || word.word, word: word.word };
    const disambiguationCandidates = await translationDisambiguationCandidates(repositories, sourceLanguage, nativeLanguage, token);
    if (!disambiguationCandidates.length) {
      result.push(word);
      continue;
    }
    const translation = (await displayTranslationForToken(repositories, sourceLanguage, nativeLanguage, token)) || word.translation;
    result.push({ ...word, translation, disambiguationCandidates });
  }
  return result;
}

// Return words for a collection with optional word or displayed-translation search.
export async function getWords(repositories, userId, collectionId, search, nativeLanguage = "English") {
  const term = normalizeName(search);
  return withDisambiguation(repositories, nativeLanguage, await repositories.words.listWords(userId, collectionId, term, nativeLanguage));
}

// Return every word across all of the user's collections in a language.
export async function getWordsInLanguage(repositories, userId, languageId, search, nativeLanguage = "English") {
  const term = normalizeName(search);
  return withDisambiguation(repositories, nativeLanguage, await repositories.words.listWordsInLanguage(userId, languageId, term, nativeLanguage));
}

// Delete user-owned words. Ignores ids that don't belong to the user.
export async function deleteWords(repositories, userId, wordIds) {
  const ids = Array.from(new Set((wordIds || []).map((id) => Number(id)).filter(Number.isFinite)));
  if (!ids.length) {
    return { error: "No words selected." };
  }

  // A word cannot be deleted while it still appears in a document, since its
  // tokens cascade-delete and would corrupt the reader. Block the whole
  // operation and tell the user which documents to remove first.
  const documents = await repositories.words.listMaterialsReferencingWords(userId, ids);
  if (documents.length) {
    return {
      status: 409,
      error: `These words appear in the following document(s): ${documents.join(", ")}. Delete the document(s) from the reader before deleting the words.`,
      errorKey: "errors.wordInDocument",
      details: { documents: documents.join(", "), count: documents.length }
    };
  }

  let deleted = 0;
  let skipped = 0;
  await repositories.database.transaction(async (tx) => {
    for (const id of ids) {
      if (!(await tx.words.wordOwnedByUser(userId, id))) {
        skipped += 1;
        continue;
      }
      const result = await tx.words.deleteWord(id);
      if (result.changes) {
        deleted += 1;
      } else {
        skipped += 1;
      }
    }
  });

  return { deleted, skipped };
}

const WORD_STATUSES = ["unknown", "learning", "known"];

// Set the learning status of several user-owned words at once. Ignores ids that
// don't belong to the user.
export async function setWordsStatus(repositories, userId, wordIds, status) {
  if (!WORD_STATUSES.includes(status)) {
    return { error: "Invalid status." };
  }
  const ids = Array.from(new Set((wordIds || []).map((id) => Number(id)).filter(Number.isFinite)));
  if (!ids.length) {
    return { error: "No words selected." };
  }

  let updated = 0;
  let skipped = 0;
  await repositories.database.transaction(async (tx) => {
    for (const id of ids) {
      if (!(await tx.words.wordOwnedByUser(userId, id))) {
        skipped += 1;
        continue;
      }
      await tx.words.upsertStatus(userId, id, status);
      updated += 1;
    }
  });

  return { updated, skipped, status };
}

// Move user-owned words into a destination collection. Words that would collide
// with an existing (word, translation) row in the destination are skipped.
export async function moveWords(repositories, userId, wordIds, collectionId) {
  const destination = await repositories.words.findCollectionById(collectionId, userId);
  if (!destination) {
    return { error: "Collection not found." };
  }

  const ids = Array.from(new Set((wordIds || []).map((id) => Number(id)).filter(Number.isFinite)));
  if (!ids.length) {
    return { error: "No words selected." };
  }

  let moved = 0;
  let skipped = 0;
  await repositories.database.transaction(async (tx) => {
    for (const id of ids) {
      if (!(await tx.words.wordOwnedByUser(userId, id))) {
        skipped += 1;
        continue;
      }
      try {
        const result = await tx.words.updateWordCollection(id, destination.id);
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

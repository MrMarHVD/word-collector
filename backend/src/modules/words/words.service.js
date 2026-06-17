/**
 * @fileoverview Words service. Business logic for vocabulary list operations:
 * listing words with disambiguation candidates, bulk deletion, bulk status
 * updates, translation override management, moving words between collections,
 * and toggling the practice mark. Coordinates with: words repository,
 * translations service, database repository (transaction).
 */

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
    const hasOverride = typeof word.translationOverride === "string" && word.translationOverride.trim();
    if (hasOverride) {
      const sourceWord = String(word.word || "").toLowerCase();
      const currentOriginal = String(word.canonicalTranslation || "");
      const canonicalTranslation = currentOriginal && currentOriginal.toLowerCase() !== sourceWord
        ? currentOriginal
        : disambiguationCandidates[0]?.translation || currentOriginal;
      result.push({ ...word, canonicalTranslation, disambiguationCandidates });
      continue;
    }
    const translation = (await displayTranslationForToken(repositories, sourceLanguage, nativeLanguage, token)) || word.translation;
    result.push({ ...word, translation, disambiguationCandidates });
  }
  return result;
}

/**
 * Return words for a collection, annotated with disambiguation candidates.
 * Optionally filters by substring on the word or its displayed translation.
 * Coordinates with: words repository, translations service.
 * @param {object} repositories
 * @param {number} userId
 * @param {number} collectionId
 * @param {string} [search]
 * @param {string} [nativeLanguage="English"]
 * @returns {Promise<object[]>}
 */
export async function getWords(repositories, userId, collectionId, search, nativeLanguage = "English") {
  const term = normalizeName(search);
  return withDisambiguation(repositories, nativeLanguage, await repositories.words.listWords(userId, collectionId, term, nativeLanguage));
}

/**
 * Return every word the user has in a language across all collections,
 * annotated with disambiguation candidates. Optionally filters by search term.
 * @param {object} repositories
 * @param {number} userId
 * @param {number} languageId
 * @param {string} [search]
 * @param {string} [nativeLanguage="English"]
 * @returns {Promise<object[]>}
 */
export async function getWordsInLanguage(repositories, userId, languageId, search, nativeLanguage = "English") {
  const term = normalizeName(search);
  return withDisambiguation(repositories, nativeLanguage, await repositories.words.listWordsInLanguage(userId, languageId, term, nativeLanguage));
}

/**
 * Remove the user's membership for a set of words. Words that appear in any
 * reader material are blocked entirely — the caller is told which document(s)
 * must be deleted first. Only the user's `user_words` row is removed; the
 * global word catalogue entry is preserved.
 * Runs in a transaction. Ignores ids not owned by the user.
 * @param {object} repositories
 * @param {number} userId
 * @param {Array<number|string>} wordIds
 * @returns {Promise<{ deleted: number, skipped: number }
 *   | { error: string, errorKey: string, status: 409, details: object }>}
 */
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
      if (!(await tx.words.userHasWord(userId, id))) {
        skipped += 1;
        continue;
      }
      // Remove the user's membership only; the global word stays for others.
      const result = await tx.words.removeUserWord(userId, id);
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

/**
 * Set the learning status of a batch of words atomically. Valid statuses:
 * `"unknown"`, `"learning"`, `"known"`. Setting a non-`"learning"` status also
 * clears the `want_to_practice` flag. Ignores ids not owned by the user.
 * @param {object} repositories
 * @param {number} userId
 * @param {Array<number|string>} wordIds
 * @param {string} status
 * @returns {Promise<{ updated: number, skipped: number, status: string }
 *   | { error: string }>}
 */
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
      if (!(await tx.words.userHasWord(userId, id))) {
        skipped += 1;
        continue;
      }
      await tx.words.upsertStatus(userId, id, status);
      updated += 1;
    }
  });

  return { updated, skipped, status };
}

/**
 * Set or clear the `want_to_practice` flag on a single word. The flag can
 * only be set to `true` when the word's status is `"learning"`; clearing it
 * is always allowed.
 * @param {object} repositories
 * @param {number} userId
 * @param {number|string} wordId
 * @param {boolean} wantToPractice
 * @returns {Promise<object|{ error: string, status: number, errorKey?: string }>}
 *   Returns the updated word row on success; an error descriptor on failure.
 */
export async function setWantToPractice(repositories, userId, wordId, wantToPractice) {
  const id = Number(wordId);
  if (!Number.isFinite(id)) {
    return { error: "Word not found.", status: 404 };
  }
  const word = await repositories.words.findWordById(userId, id);
  if (!word) {
    return { error: "Word not found.", status: 404 };
  }
  if (wantToPractice && word.status !== "learning") {
    return { error: "Only learning words can be marked for practice.", status: 409, errorKey: "errors.practiceMarkRequiresLearning" };
  }
  await repositories.words.setWantToPractice(userId, id, wantToPractice);
  return repositories.words.findWordById(userId, id);
}

/**
 * Set or clear a user's personal translation override for a word. The shared
 * canonical translation (on the `words` row) is never touched. An empty or
 * whitespace-only value clears the override (stores `null`).
 * @param {object} repositories
 * @param {number} userId
 * @param {number|string} wordId
 * @param {string} translationOverride
 * @param {string} [nativeLanguage="English"]
 * @returns {Promise<object|{ error: string, status: 404 }>}
 */
export async function setTranslationOverride(repositories, userId, wordId, translationOverride, nativeLanguage = "English") {
  const id = Number(wordId);
  if (!Number.isFinite(id)) {
    return { error: "Word not found.", status: 404 };
  }
  const word = await repositories.words.findWordById(userId, id, nativeLanguage);
  if (!word) {
    return { error: "Word not found.", status: 404 };
  }
  const normalized = typeof translationOverride === "string" ? translationOverride.trim() : "";
  await repositories.words.setTranslationOverride(userId, id, normalized || null);
  return repositories.words.findWordById(userId, id, nativeLanguage);
}

/**
 * Move a batch of user-owned words to a destination collection atomically.
 * The destination collection must belong to the user. Words that do not belong
 * to the user, or that fail the move (e.g. a constraint), are counted as
 * skipped rather than causing the whole operation to fail.
 * @param {object} repositories
 * @param {number} userId
 * @param {Array<number|string>} wordIds
 * @param {number} collectionId
 * @returns {Promise<{ collection: object, moved: number, skipped: number }
 *   | { error: string }>}
 */
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
      if (!(await tx.words.userHasWord(userId, id))) {
        skipped += 1;
        continue;
      }
      try {
        const result = await tx.words.updateWordCollection(userId, id, destination.id);
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

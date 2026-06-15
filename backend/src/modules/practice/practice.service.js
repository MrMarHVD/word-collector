/**
 * @fileoverview Practice service. Builds flashcard session payloads from a
 * user's learning words. Two session modes are supported: automatic (driven by
 * click activity) and marked (user-flagged words only).
 */

const MIN_WORDS_PER_SESSION = 1;
const MAX_WORDS_PER_SESSION = 200;
const DEFAULT_WORDS_PER_SESSION = 20;

// Fisher–Yates shuffle on a copy so the source ordering is preserved.
function shuffle(items) {
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Clamp and coerce a raw "words per session" value to the allowed range
 * [1, 200]. Returns the default (20) when the value is non-numeric.
 * @param {number|string} value
 * @returns {number}
 */
export function normalizeWordsPerSession(value) {
  const number = Math.trunc(Number(value));
  if (!Number.isFinite(number)) {
    return DEFAULT_WORDS_PER_SESSION;
  }
  return Math.min(MAX_WORDS_PER_SESSION, Math.max(MIN_WORDS_PER_SESSION, number));
}

/**
 * Build a practice session for one language. Selection algorithm:
 * 1. Multi-clicked learning words (`click_count > 1`), most-clicked first.
 * 2. Top up to `requestedCount` with a random subset of single-clicked words.
 * Words that have never been opened (`click_count = 0`) are excluded.
 * `insufficient` is `true` when fewer valid words exist than requested.
 *
 * @param {object} repositories
 * @param {number} userId
 * @param {number} languageId
 * @param {string} languageName
 * @param {string} nativeLanguage
 * @param {number} requestedCount
 * @returns {Promise<{ languageId: number, languageName: string, requested: number,
 *   validCount: number, insufficient: boolean, words: object[] }>}
 */
export async function buildPracticeSession(repositories, userId, languageId, languageName, nativeLanguage, requestedCount) {
  const requested = normalizeWordsPerSession(requestedCount);
  const learning = await repositories.practice.listLearningWords(userId, languageId, nativeLanguage);

  const card = (word) => ({
    wordId: word.wordId,
    word: word.word,
    translation: word.translation || "",
    reading: word.reading && word.reading !== word.lemma ? word.reading : "",
    pinyin: word.pinyin || "",
    clickCount: word.clickCount
  });

  const multiClicked = learning.filter((word) => word.clickCount > 1).map(card);
  const singleClicked = learning.filter((word) => word.clickCount === 1).map(card);
  const validCount = multiClicked.length + singleClicked.length;

  const selected = multiClicked.slice(0, requested);
  if (selected.length < requested) {
    const remaining = requested - selected.length;
    selected.push(...shuffle(singleClicked).slice(0, remaining));
  }

  return {
    languageId,
    languageName,
    requested,
    validCount,
    insufficient: validCount < requested,
    words: selected
  };
}

/**
 * Build a "marked words" practice session. Every learning word flagged with
 * `want_to_practice = 1` is a valid candidate; a random subset of size
 * `requestedCount` is returned. Click activity is not considered.
 *
 * @param {object} repositories
 * @param {number} userId
 * @param {number} languageId
 * @param {string} languageName
 * @param {string} nativeLanguage
 * @param {number} requestedCount
 * @returns {Promise<{ languageId: number, languageName: string, requested: number,
 *   validCount: number, insufficient: boolean, words: object[], mode: "marked" }>}
 */
export async function buildMarkedPracticeSession(repositories, userId, languageId, languageName, nativeLanguage, requestedCount) {
  const requested = normalizeWordsPerSession(requestedCount);
  const marked = await repositories.practice.listWantToPracticeWords(userId, languageId, nativeLanguage);

  const cards = marked.map((word) => ({
    wordId: word.wordId,
    word: word.word,
    translation: word.translation || "",
    reading: word.reading && word.reading !== word.lemma ? word.reading : "",
    pinyin: word.pinyin || "",
    clickCount: word.clickCount
  }));

  const selected = shuffle(cards).slice(0, requested);

  return {
    languageId,
    languageName,
    requested,
    validCount: cards.length,
    insufficient: cards.length < requested,
    words: selected,
    mode: "marked"
  };
}

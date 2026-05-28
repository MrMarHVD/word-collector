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

export function normalizeWordsPerSession(value) {
  const number = Math.trunc(Number(value));
  if (!Number.isFinite(number)) {
    return DEFAULT_WORDS_PER_SESSION;
  }
  return Math.min(MAX_WORDS_PER_SESSION, Math.max(MIN_WORDS_PER_SESSION, number));
}

// Pick the words for one practice session in a language.
//   1. Learning words clicked more than once, most-clicked first.
//   2. If short of the requested count, top up with a random set of learning
//      words clicked exactly once.
// A learning word never opened (click_count 0) is not a valid practice word, so
// when fewer than the requested count are valid the caller is told how many
// (validCount) were available.
export function buildPracticeSession(repositories, userId, languageId, languageName, nativeLanguage, requestedCount) {
  const requested = normalizeWordsPerSession(requestedCount);
  const learning = repositories.practice.listLearningWords(userId, languageId, nativeLanguage);

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

import { normalizeName } from "../../shared/normalize.js";

// Return words for a collection with optional word or displayed-translation search.
export function getWords(repositories, userId, collectionId, search, nativeLanguage = "English") {
  const term = normalizeName(search);
  return repositories.words.listWords(userId, collectionId, term, nativeLanguage);
}

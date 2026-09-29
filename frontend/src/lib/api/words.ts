/** Word endpoints: vocab lists, status, moves, deletion, clicks, practice flag and translation overrides. */

import { request } from "./client";
import type {
  CollectionWordsResponse,
  DeleteWordsResponse,
  LanguageWordsResponse,
  MoveWordsResponse,
  SetWordsStatusResponse,
  WordDetail,
  WordListParams,
  WordStatus
} from "./types";

/** GET /api/languages/:id/words: every word in a language ("All" collections). */
export function listByLanguage(languageId: number, params: WordListParams = {}): Promise<LanguageWordsResponse> {
  return request(`/api/languages/${languageId}/words`, { query: { search: params.search } });
}

/** GET /api/collections/:id/words: the words of one collection. */
export function listByCollection(collectionId: number, params: WordListParams = {}): Promise<CollectionWordsResponse> {
  return request(`/api/collections/${collectionId}/words`, { query: { search: params.search } });
}

/** PATCH /api/words/:id: sets one word's status. */
export function setStatus(wordId: number, status: WordStatus): Promise<WordDetail> {
  return request(`/api/words/${wordId}`, { method: "PATCH", body: { status } });
}

/** POST /api/words/status: sets the status of several words. */
export function setStatuses(wordIds: number[], status: WordStatus): Promise<SetWordsStatusResponse> {
  return request("/api/words/status", { method: "POST", body: { wordIds, status } });
}

/** POST /api/words/move: moves words to another collection. */
export function move(wordIds: number[], collectionId: number): Promise<MoveWordsResponse> {
  return request("/api/words/move", { method: "POST", body: { wordIds, collectionId } });
}

/** POST /api/words/delete: removes words from the user's list; 409 errors.wordInDocument while a document uses them. */
export function remove(wordIds: number[]): Promise<DeleteWordsResponse> {
  return request("/api/words/delete", { method: "POST", body: { wordIds } });
}

/** POST /api/words/:id/click: counts a reader click (drives practice selection). */
export function click(wordId: number): Promise<{ ok: true }> {
  return request(`/api/words/${wordId}/click`, { method: "POST" });
}

/** POST /api/words/:id/want-to-practice; 409 errors.practiceMarkRequiresLearning unless the word is learning. */
export function setWantToPractice(wordId: number, wantToPractice: boolean): Promise<WordDetail> {
  return request(`/api/words/${wordId}/want-to-practice`, { method: "POST", body: { wantToPractice } });
}

/** PATCH /api/words/:id/translation-override; null clears the override. */
export function setTranslationOverride(wordId: number, translationOverride: string | null): Promise<WordDetail> {
  return request(`/api/words/${wordId}/translation-override`, { method: "PATCH", body: { translationOverride } });
}

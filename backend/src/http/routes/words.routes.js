/**
 * @fileoverview Route handlers for word-level read and mutation operations.
 *
 * Words are the core entities that users collect while reading materials. Routes
 * here cover listing words (scoped to a language or a collection), bulk status
 * and deletion operations, per-word click tracking, "want to practice" flagging,
 * custom translation overrides, and individual status updates.
 */

import { getLanguage } from "../../modules/languages/languages.service.js";
import { deleteWords, getWords, getWordsInLanguage, moveWords, setTranslationOverride, setWantToPractice, setWordsStatus } from "../../modules/words/words.service.js";
import { readJson } from "../request.js";
import { jsonResponse } from "../response.js";

/**
 * Creates route handlers for all word-related endpoints.
 *
 * **GET /api/languages/:id/words?[search=]**
 * Returns all words in a language, optionally filtered by a search string.
 * Translations are rendered in the user's native language.
 * - Response 200: `{ language, words: Word[] }`
 * - Response 404: language not found.
 *
 * **GET /api/collections/:id/words?[search=]**
 * Returns all words in a specific collection, optionally filtered.
 * - Response 200: `{ collection, words: Word[] }`
 * - Response 404: collection not found or not owned by the user.
 *
 * **POST /api/words/delete**
 * Bulk-deletes words by ID. Only words owned by the user are deleted.
 * - Body: `{ wordIds: number[] }`
 * - Response 200: deletion result from the service.
 * - Response 400: validation error.
 *
 * **POST /api/words/status**
 * Sets the learning status of multiple words in one call.
 * - Body: `{ wordIds: number[], status: "unknown"|"learning"|"known" }`
 * - Response 200: update result from the service.
 * - Response 400: invalid status or ownership error.
 *
 * **POST /api/words/move**
 * Moves multiple words to a different collection.
 * - Body: `{ wordIds: number[], collectionId: number }`
 * - Response 200: move result from the service.
 * - Response 400: validation or ownership error.
 *
 * **POST /api/words/:id/click**
 * Increments the click counter for a word (tracks reader engagement).
 * - Response 200: `{ ok: true }`
 * - Response 404: word not found or not owned by the user.
 *
 * **POST /api/words/:id/want-to-practice**
 * Toggles the "want to practice" flag on a word.
 * - Body: `{ wantToPractice: boolean }`
 * - Response 200: updated word state from the service.
 * - Response 400/404: validation or ownership error.
 *
 * **PATCH /api/words/:id/translation-override**
 * Sets or clears a user-provided translation override for a word.
 * - Body: `{ translationOverride: string|null }`
 * - Response 200: updated word from the service.
 * - Response 400/404: validation or ownership error.
 *
 * **PATCH /api/words/:id**
 * Updates the learning status of a single word. Accepts either
 * `{ status: "unknown"|"learning"|"known" }` or the legacy
 * `{ known: boolean }` shape for backwards compatibility.
 * - Response 200: updated word record.
 * - Response 400: invalid status value.
 * - Response 404: word not found or not owned by the user.
 *
 * @param {Object} deps
 * @param {import("../../db/repositories.js").Repositories} deps.repositories
 * @returns {(req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse, url: URL, user: import("../../auth/session.js").SessionUser) => Promise<boolean>}
 */
export function createWordsRoutes({ repositories }) {
  return async function handleWordsRoutes(req, res, url, user) {
    const languageWordsMatch = url.pathname.match(/^\/api\/languages\/(\d+)\/words$/);
    if (req.method === "GET" && languageWordsMatch) {
      const languageId = Number(languageWordsMatch[1]);
      const language = await getLanguage(repositories, user.userId, languageId);
      if (!language) {
        jsonResponse(res, 404, { error: "Language not found." });
        return true;
      }
      const nativeLanguage = (await repositories.auth.findUserById(user.userId))?.nativeLanguage || "English";
      jsonResponse(res, 200, {
        language,
        words: await getWordsInLanguage(repositories, user.userId, languageId, url.searchParams.get("search") || "", nativeLanguage)
      });
      return true;
    }

    const wordsMatch = url.pathname.match(/^\/api\/collections\/(\d+)\/words$/);
    if (req.method === "GET" && wordsMatch) {
      const collectionId = Number(wordsMatch[1]);
      const collection = await repositories.words.findCollectionById(collectionId, user.userId);
      if (!collection) {
        jsonResponse(res, 404, { error: "Collection not found." });
        return true;
      }
      const nativeLanguage = (await repositories.auth.findUserById(user.userId))?.nativeLanguage || "English";
      jsonResponse(res, 200, {
        collection,
        words: await getWords(repositories, user.userId, collectionId, url.searchParams.get("search") || "", nativeLanguage)
      });
      return true;
    }

    if (req.method === "POST" && url.pathname === "/api/words/delete") {
      const body = await readJson(req);
      const result = await deleteWords(repositories, user.userId, body.wordIds);
      if (result.error) {
        jsonResponse(res, result.status || 400, result);
        return true;
      }
      jsonResponse(res, 200, result);
      return true;
    }

    if (req.method === "POST" && url.pathname === "/api/words/status") {
      const body = await readJson(req);
      const result = await setWordsStatus(repositories, user.userId, body.wordIds, body.status);
      if (result.error) {
        jsonResponse(res, 400, result);
        return true;
      }
      jsonResponse(res, 200, result);
      return true;
    }

    if (req.method === "POST" && url.pathname === "/api/words/move") {
      const body = await readJson(req);
      const result = await moveWords(repositories, user.userId, body.wordIds, Number(body.collectionId));
      if (result.error) {
        jsonResponse(res, 400, result);
        return true;
      }
      jsonResponse(res, 200, result);
      return true;
    }

    const wordClickMatch = url.pathname.match(/^\/api\/words\/(\d+)\/click$/);
    if (req.method === "POST" && wordClickMatch) {
      const id = Number(wordClickMatch[1]);
      if (!(await repositories.words.userHasWord(user.userId, id))) {
        jsonResponse(res, 404, { error: "Word not found." });
        return true;
      }
      await repositories.words.incrementClickCount(user.userId, id);
      jsonResponse(res, 200, { ok: true });
      return true;
    }

    const wantToPracticeMatch = url.pathname.match(/^\/api\/words\/(\d+)\/want-to-practice$/);
    if (req.method === "POST" && wantToPracticeMatch) {
      const id = Number(wantToPracticeMatch[1]);
      const body = await readJson(req);
      const result = await setWantToPractice(repositories, user.userId, id, Boolean(body.wantToPractice));
      if (result.error) {
        jsonResponse(res, result.status || 400, result);
        return true;
      }
      jsonResponse(res, 200, result);
      return true;
    }

    const translationOverrideMatch = url.pathname.match(/^\/api\/words\/(\d+)\/translation-override$/);
    if (req.method === "PATCH" && translationOverrideMatch) {
      const id = Number(translationOverrideMatch[1]);
      const body = await readJson(req);
      const nativeLanguage = (await repositories.auth.findUserById(user.userId))?.nativeLanguage || "English";
      const result = await setTranslationOverride(repositories, user.userId, id, body.translationOverride, nativeLanguage);
      if (result.error) {
        jsonResponse(res, result.status || 400, result);
        return true;
      }
      jsonResponse(res, 200, result);
      return true;
    }

    const wordPatchMatch = url.pathname.match(/^\/api\/words\/(\d+)$/);
    if (req.method === "PATCH" && wordPatchMatch) {
      const id = Number(wordPatchMatch[1]);
      const body = await readJson(req);
      const allowed = ["unknown", "learning", "known"];
      // Accept either an explicit status or the legacy boolean `known` payload.
      const requested = typeof body.status === "string" ? body.status : (body.known ? "known" : "unknown");
      if (!allowed.includes(requested)) {
        jsonResponse(res, 400, { error: "Invalid status." });
        return true;
      }
      const existingWord = await repositories.words.findWordById(user.userId, id);
      if (!existingWord) {
        jsonResponse(res, 404, { error: "Word not found." });
        return true;
      }
      await repositories.words.upsertStatus(user.userId, id, requested);
      jsonResponse(res, 200, await repositories.words.findWordById(user.userId, id));
      return true;
    }

    return false;
  };
}

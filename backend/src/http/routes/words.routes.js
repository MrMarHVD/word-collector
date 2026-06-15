import { getLanguage } from "../../modules/languages/languages.service.js";
import { deleteWords, getWords, getWordsInLanguage, moveWords, setTranslationOverride, setWantToPractice, setWordsStatus } from "../../modules/words/words.service.js";
import { readJson } from "../request.js";
import { jsonResponse } from "../response.js";

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

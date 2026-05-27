import { getLanguage } from "../../modules/languages/languages.service.js";
import { deleteWords, getWords, getWordsInLanguage, moveWords } from "../../modules/words/words.service.js";
import { readJson } from "../request.js";
import { jsonResponse } from "../response.js";

export function createWordsRoutes({ repositories }) {
  return async function handleWordsRoutes(req, res, url, user) {
    const languageWordsMatch = url.pathname.match(/^\/api\/languages\/(\d+)\/words$/);
    if (req.method === "GET" && languageWordsMatch) {
      const languageId = Number(languageWordsMatch[1]);
      const language = getLanguage(repositories, user.userId, languageId);
      if (!language) {
        jsonResponse(res, 404, { error: "Language not found." });
        return true;
      }
      const nativeLanguage = repositories.auth.findUserById(user.userId)?.nativeLanguage || "English";
      jsonResponse(res, 200, {
        language,
        words: getWordsInLanguage(repositories, user.userId, languageId, url.searchParams.get("search") || "", nativeLanguage)
      });
      return true;
    }

    const wordsMatch = url.pathname.match(/^\/api\/collections\/(\d+)\/words$/);
    if (req.method === "GET" && wordsMatch) {
      const collectionId = Number(wordsMatch[1]);
      const collection = repositories.words.findCollectionById(collectionId, user.userId);
      if (!collection) {
        jsonResponse(res, 404, { error: "Collection not found." });
        return true;
      }
      const nativeLanguage = repositories.auth.findUserById(user.userId)?.nativeLanguage || "English";
      jsonResponse(res, 200, {
        collection,
        words: getWords(repositories, user.userId, collectionId, url.searchParams.get("search") || "", nativeLanguage)
      });
      return true;
    }

    if (req.method === "POST" && url.pathname === "/api/words/delete") {
      const body = await readJson(req);
      const result = deleteWords(repositories, user.userId, body.wordIds);
      if (result.error) {
        jsonResponse(res, 400, result);
        return true;
      }
      jsonResponse(res, 200, result);
      return true;
    }

    if (req.method === "POST" && url.pathname === "/api/words/move") {
      const body = await readJson(req);
      const result = moveWords(repositories, user.userId, body.wordIds, Number(body.collectionId));
      if (result.error) {
        jsonResponse(res, 400, result);
        return true;
      }
      jsonResponse(res, 200, result);
      return true;
    }

    const knownMatch = url.pathname.match(/^\/api\/words\/(\d+)$/);
    if (req.method === "PATCH" && knownMatch) {
      const id = Number(knownMatch[1]);
      const body = await readJson(req);
      const known = body.known ? 1 : 0;
      const existingWord = repositories.words.findWordById(user.userId, id);
      if (!existingWord) {
        jsonResponse(res, 404, { error: "Word not found." });
        return true;
      }
      repositories.words.upsertKnown(user.userId, id, known);
      jsonResponse(res, 200, repositories.words.findWordById(user.userId, id));
      return true;
    }

    return false;
  };
}

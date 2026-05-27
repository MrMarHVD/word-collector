import { getWords } from "../../modules/words/words.service.js";
import { readJson } from "../request.js";
import { jsonResponse } from "../response.js";

export function createWordsRoutes({ repositories }) {
  return async function handleWordsRoutes(req, res, url, user) {
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

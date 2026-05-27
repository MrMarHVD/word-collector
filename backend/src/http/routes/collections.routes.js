import { getLanguage } from "../../modules/languages/languages.service.js";
import { readJson } from "../request.js";
import { jsonResponse } from "../response.js";

export function createCollectionsRoutes({ repositories }) {
  return async function handleCollectionsRoutes(req, res, url, user) {
    const collectionMatch = url.pathname.match(/^\/api\/collections\/(\d+)$/);
    if (!collectionMatch) {
      return false;
    }

    if (req.method === "PATCH") {
      const collectionId = Number(collectionMatch[1]);
      const body = await readJson(req);
      const language = getLanguage(repositories, user.userId, body.languageId);
      if (!language) {
        jsonResponse(res, 400, { error: "Language is required." });
        return true;
      }
      const collection = repositories.words.findCollectionById(collectionId, user.userId);
      if (!collection) {
        jsonResponse(res, 404, { error: "Collection not found." });
        return true;
      }
      try {
        repositories.words.updateCollectionLanguage(language.id, collectionId);
      } catch (error) {
        jsonResponse(res, 409, { error: "A collection with this name already exists in that language." });
        return true;
      }
      jsonResponse(res, 200, repositories.words.findCollectionById(collectionId, user.userId));
      return true;
    }

    if (req.method === "DELETE") {
      const collectionId = Number(collectionMatch[1]);
      if (!repositories.words.findCollectionById(collectionId, user.userId)) {
        jsonResponse(res, 404, { error: "Collection not found." });
        return true;
      }
      const result = repositories.words.deleteCollection(collectionId);
      if (!result.changes) {
        jsonResponse(res, 404, { error: "Collection not found." });
        return true;
      }
      jsonResponse(res, 200, { deleted: true, id: collectionId });
      return true;
    }

    return false;
  };
}

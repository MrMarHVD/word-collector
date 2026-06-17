/**
 * @fileoverview Route handlers for the `/api/collections/:id` resource.
 *
 * Collections group words within a study language. The routes here allow
 * reassigning a collection to a different language and permanently deleting
 * a collection (and all its words, by cascading delete in the repository).
 */

import { getLanguage } from "../../modules/languages/languages.service.js";
import { readJson } from "../request.js";
import { jsonResponse } from "../response.js";

/**
 * Creates route handlers for `/api/collections/:id`.
 *
 * Only paths matching `/api/collections/:id` (numeric ID) are handled;
 * all others return `false` immediately.
 *
 * **PATCH /api/collections/:id**
 * Moves the collection to a different study language.
 * - Body: `{ languageId: number }` — the target language (must be owned by the user).
 * - Response 200: updated collection record.
 * - Response 400: `languageId` missing or language not found.
 * - Response 404: collection not found or not owned by the user.
 * - Response 409: a collection with the same name already exists in the target language
 *   (unique constraint violation).
 *
 * **DELETE /api/collections/:id**
 * Permanently deletes the collection. Associated words are removed via a
 * cascading delete in the repository layer.
 * - Response 200: `{ deleted: true, id: number }`
 * - Response 404: collection not found or not owned by the user.
 *
 * @param {Object} deps
 * @param {import("../../db/repositories.js").Repositories} deps.repositories
 * @returns {(req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse, url: URL, user: import("../../auth/session.js").SessionUser) => Promise<boolean>}
 */
export function createCollectionsRoutes({ repositories }) {
  return async function handleCollectionsRoutes(req, res, url, user) {
    const collectionMatch = url.pathname.match(/^\/api\/collections\/(\d+)$/);
    if (!collectionMatch) {
      return false;
    }

    if (req.method === "PATCH") {
      const collectionId = Number(collectionMatch[1]);
      const body = await readJson(req);
      const language = await getLanguage(repositories, user.userId, body.languageId);
      if (!language) {
        jsonResponse(res, 400, { error: "Language is required." });
        return true;
      }
      const collection = await repositories.words.findCollectionById(collectionId, user.userId);
      if (!collection) {
        jsonResponse(res, 404, { error: "Collection not found." });
        return true;
      }
      try {
        await repositories.words.updateCollectionLanguage(language.id, collectionId);
      } catch (error) {
        jsonResponse(res, 409, { error: "A collection with this name already exists in that language." });
        return true;
      }
      jsonResponse(res, 200, await repositories.words.findCollectionById(collectionId, user.userId));
      return true;
    }

    if (req.method === "DELETE") {
      const collectionId = Number(collectionMatch[1]);
      if (!(await repositories.words.findCollectionById(collectionId, user.userId))) {
        jsonResponse(res, 404, { error: "Collection not found." });
        return true;
      }
      const result = await repositories.words.deleteCollection(collectionId);
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

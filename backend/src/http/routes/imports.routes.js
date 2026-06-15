/**
 * @fileoverview Route handler for bulk word import (`/api/import`).
 *
 * The import endpoint accepts a structured word list (typically parsed from a
 * CSV on the client) and upserts all entries into the user's vocabulary, either
 * placing them in an existing collection or creating a new one by name.
 */

import { importWords } from "../../modules/imports/imports.service.js";
import { readJson } from "../request.js";
import { jsonResponse } from "../response.js";

/**
 * Creates the route handler for `POST /api/import`.
 *
 * **POST /api/import**
 * Bulk-imports a word list into the user's vocabulary.
 *
 * Supply either `collectionId` to add into an existing collection, or
 * `collectionName` to create a new one. `languageId` is required in both cases.
 * Each entry in `words` should conform to the shape expected by `importWords`
 * in the imports service (typically `{ word, translation, status }`).
 *
 * - Body: `{ languageId: number, collectionName?: string, collectionId?: number, words: object[] }`
 * - Response 201: import result (counts of created/updated words, collection info).
 * - Response 400: `{ error, errorKey }` for validation failures (e.g. unknown language,
 *   missing required fields, invalid word data).
 *
 * @param {Object} deps
 * @param {import("../../db/repositories.js").Repositories} deps.repositories
 * @returns {(req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse, url: URL, user: import("../../auth/session.js").SessionUser) => Promise<boolean>}
 */
export function createImportsRoutes({ repositories }) {
  return async function handleImportsRoutes(req, res, url, user) {
    if (req.method !== "POST" || url.pathname !== "/api/import") {
      return false;
    }

    const body = await readJson(req);
    const result = await importWords(repositories, user.userId, {
      collectionName: body.collectionName,
      collectionId: body.collectionId,
      languageId: body.languageId,
      words: body.words
    });
    if (result.error) {
      jsonResponse(res, 400, result);
      return true;
    }
    jsonResponse(res, 201, result);
    return true;
  };
}

/**
 * @fileoverview Admin "Words" route factory (issue ADM-003).
 *
 * Exposes the admin word/translation management endpoints under
 * `/api/admin/words/*`. Every handler asserts admin privilege via
 * `requireAdmin(res, user)` before serving. The endpoints read the global word
 * catalogue scoped to one source language (keyset pagination + word/lemma
 * search) and upsert the shared canonical translation for a (word, native
 * language) pair; per-user translation overrides are never modified.
 *
 * The admin-words repository is instantiated here from the shared `db` executor
 * (the same singleton `createRepositories` uses) so this issue stays confined to
 * its own files and does not edit `api.js` or the module registry.
 */

import { NATIVE_LANGUAGE_OPTIONS } from "../../config.js";
import { db } from "../../db/index.js";
import { createAdminWordsRepository } from "../../modules/admin/admin-words.repository.js";
import { listAdminSourceLanguages, listAdminWords, upsertCanonicalTranslation } from "../../modules/admin/admin-words.service.js";
import { requireAdmin } from "./admin-guards.js";
import { readJson } from "../request.js";
import { jsonResponse } from "../response.js";

/**
 * Create the `/api/admin/words/*` route handler.
 *
 * **GET /api/admin/words/languages**
 * Lists the global source languages that contain words, plus the supported
 * native-language options for the translation-cell selector.
 * - Response 200: `{ languages: {id,name}[], nativeLanguageOptions: string[] }`
 *
 * **GET /api/admin/words?languageId=&native=&search=&cursor=&limit=**
 * Returns one keyset page of words for the selected source language with the
 * canonical translation cell for the selected native language (default English).
 * All words are returned regardless of whether a translation exists.
 * - Response 200: `{ words, nextCursor, nativeLanguage }`
 * - Response 400: missing/invalid source language.
 *
 * **PATCH /api/admin/words/:id/translation**
 * Upserts the shared canonical translation for the word in the given native
 * language and audits the change.
 * - Body: `{ native?: string, translation: string }`
 * - Response 200: `{ word }`
 * - Response 404: word not found.
 *
 * @param {Object} deps
 * @param {import("../../db/repositories.js").Repositories} deps.repositories
 * @returns {(req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse, url: URL, user: import("../../auth/session.js").SessionUser) => Promise<boolean>}
 *   Resolves to `true` if the request was handled, otherwise `false`.
 */
export function createAdminWordsRoutes({ repositories }) {
  const adminWords = createAdminWordsRepository(db);

  return async function handleAdminWordsRoutes(req, res, url, user) {
    if (req.method === "GET" && url.pathname === "/api/admin/words/languages") {
      if (!requireAdmin(res, user)) {
        return true;
      }
      jsonResponse(res, 200, {
        languages: await listAdminSourceLanguages(repositories, adminWords),
        nativeLanguageOptions: NATIVE_LANGUAGE_OPTIONS
      });
      return true;
    }

    if (req.method === "GET" && url.pathname === "/api/admin/words") {
      if (!requireAdmin(res, user)) {
        return true;
      }
      const result = await listAdminWords(repositories, adminWords, {
        languageId: url.searchParams.get("languageId"),
        nativeLanguage: url.searchParams.get("native"),
        search: url.searchParams.get("search") || "",
        cursor: url.searchParams.get("cursor"),
        limit: url.searchParams.get("limit")
      });
      if (result.error) {
        jsonResponse(res, result.status || 400, { error: result.error });
        return true;
      }
      jsonResponse(res, 200, result);
      return true;
    }

    const translationMatch = url.pathname.match(/^\/api\/admin\/words\/(\d+)\/translation$/);
    if (req.method === "PATCH" && translationMatch) {
      if (!requireAdmin(res, user)) {
        return true;
      }
      const id = Number(translationMatch[1]);
      const body = await readJson(req);
      const result = await upsertCanonicalTranslation(
        repositories,
        adminWords,
        user,
        id,
        body.native,
        body.translation
      );
      if (result.error) {
        jsonResponse(res, result.status || 400, { error: result.error });
        return true;
      }
      jsonResponse(res, 200, result);
      return true;
    }

    return false;
  };
}

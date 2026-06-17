/**
 * @fileoverview Route handlers for the `/api/languages` endpoint.
 *
 * Covers listing the authenticated user's study languages together with
 * predefined language options, and adding a new study language to their account.
 */

import { STUDY_LANGUAGE_OPTIONS } from "../../config.js";
import { addStudyLanguageForUser, getLanguages } from "../../modules/languages/languages.service.js";
import { readJson } from "../request.js";
import { jsonResponse } from "../response.js";

async function buildLanguagesPayload(repositories, userId) {
  return {
    languages: await getLanguages(repositories, userId),
    predefinedLanguages: await repositories.languages.listPredefined(),
    studyLanguageOptions: STUDY_LANGUAGE_OPTIONS
  };
}

/**
 * Creates the route handler for `/api/languages`.
 *
 * **GET /api/languages**
 * Returns the authenticated user's study languages, the global list of
 * predefined languages, and the available study-language options.
 * - Response 200: `{ languages, predefinedLanguages, studyLanguageOptions }`
 *
 * **POST /api/languages**
 * Adds a new study language for the authenticated user, deriving default
 * translation behaviour from the user's native language profile.
 * - Body: `{ name: string }` — display name of the language to add.
 * - Response 201: `{ languages, predefinedLanguages, studyLanguageOptions, language }`
 *   where `language` is the newly created entry.
 * - Response 400: `{ error, errorKey }` if the language is invalid or already added.
 *
 * @param {Object} deps
 * @param {import("../../db/repositories.js").Repositories} deps.repositories
 * @returns {(req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse, url: URL, user: import("../../auth/session.js").SessionUser) => Promise<boolean>}
 *   Returns `true` if the request was handled, `false` to pass to the next handler.
 */
export function createLanguagesRoutes({ repositories }) {
  return async function handleLanguagesRoutes(req, res, url, user) {
    if (url.pathname !== "/api/languages") {
      return false;
    }

    if (req.method === "GET") {
      jsonResponse(res, 200, await buildLanguagesPayload(repositories, user.userId));
      return true;
    }

    if (req.method === "POST") {
      const body = await readJson(req);
      const profile = await repositories.auth.findUserById(user.userId);
      const result = await addStudyLanguageForUser(repositories, user.userId, body.name, profile?.nativeLanguage || "English");
      if (result.error) {
        jsonResponse(res, 400, { error: result.error, errorKey: result.errorKey });
        return true;
      }
      jsonResponse(res, 201, {
        ...(await buildLanguagesPayload(repositories, user.userId)),
        language: result.language
      });
      return true;
    }

    return false;
  };
}

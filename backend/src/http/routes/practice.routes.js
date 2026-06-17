/**
 * @fileoverview Route handler for practice session generation.
 *
 * A practice session is a server-assembled set of words presented to the user
 * for active recall. The session size is drawn from the user's profile setting
 * (`practiceWordsPerSession`). Two modes are supported: a standard session that
 * selects words due for review, and a "marked" session that only includes words
 * the user has explicitly flagged with "want to practice".
 */

import { getLanguage } from "../../modules/languages/languages.service.js";
import { buildMarkedPracticeSession, buildPracticeSession } from "../../modules/practice/practice.service.js";
import { jsonResponse } from "../response.js";

/**
 * Creates the route handler for `/api/practice/session`.
 *
 * **GET /api/practice/session?languageId=&[mode=marked]**
 * Builds and returns a practice session for the specified language.
 *
 * - `languageId` (required) — ID of the study language. Must be owned by the user.
 * - `mode` (optional) — Pass `"marked"` to restrict the session to words flagged
 *   with "want to practice"; omit for the standard spaced-repetition selection.
 *
 * The session word count is derived from the user's `practiceWordsPerSession`
 * profile setting; it falls back to the service default if the profile is absent.
 * Translations are rendered in the user's native language.
 *
 * - Response 200: session payload from `buildPracticeSession` or
 *   `buildMarkedPracticeSession` (word list with translation and status data).
 * - Response 404: language not found or not owned by the user.
 *
 * @param {Object} deps
 * @param {import("../../db/repositories.js").Repositories} deps.repositories
 * @returns {(req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse, url: URL, user: import("../../auth/session.js").SessionUser) => Promise<boolean>}
 */
export function createPracticeRoutes({ repositories }) {
  return async function handlePracticeRoutes(req, res, url, user) {
    if (req.method !== "GET" || url.pathname !== "/api/practice/session") {
      return false;
    }

    const languageId = Number(url.searchParams.get("languageId"));
    const language = await getLanguage(repositories, user.userId, languageId);
    if (!language) {
      jsonResponse(res, 404, { error: "Language not found." });
      return true;
    }

    const profile = await repositories.auth.findUserById(user.userId);
    const build = url.searchParams.get("mode") === "marked" ? buildMarkedPracticeSession : buildPracticeSession;
    const session = await build(
      repositories,
      user.userId,
      languageId,
      language.name,
      profile?.nativeLanguage || "English",
      profile?.practiceWordsPerSession
    );
    jsonResponse(res, 200, session);
    return true;
  };
}

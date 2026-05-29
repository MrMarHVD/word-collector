import { getLanguage } from "../../modules/languages/languages.service.js";
import { buildPracticeSession } from "../../modules/practice/practice.service.js";
import { jsonResponse } from "../response.js";

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
    const session = await buildPracticeSession(
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

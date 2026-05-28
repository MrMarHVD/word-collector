import { NATIVE_LANGUAGE_OPTIONS } from "../../config.js";
import { normalizeWordsPerSession } from "../../modules/practice/practice.service.js";
import { backfillUserTranslations } from "../../modules/translations/translations.service.js";
import { readJson } from "../request.js";
import { jsonResponse } from "../response.js";

export function createSettingsRoutes({ repositories }) {
  return async function handleSettingsRoutes(req, res, url, user) {
    if (req.method !== "PATCH" || url.pathname !== "/api/settings") {
      return false;
    }

    const body = await readJson(req);
    const nativeLanguage = String(body.nativeLanguage || "");
    if (!NATIVE_LANGUAGE_OPTIONS.includes(nativeLanguage)) {
      jsonResponse(res, 400, { error: "Unsupported native language." });
      return true;
    }
    repositories.auth.updateNativeLanguage(nativeLanguage, user.userId);
    backfillUserTranslations(repositories, user.userId, nativeLanguage);

    if (body.practiceWordsPerSession !== undefined && body.practiceWordsPerSession !== null) {
      repositories.auth.updatePracticeWordsPerSession(normalizeWordsPerSession(body.practiceWordsPerSession), user.userId);
    }

    const profile = repositories.auth.findUserById(user.userId);
    jsonResponse(res, 200, {
      user: {
        id: user.userId,
        email: user.email,
        nativeLanguage: profile.nativeLanguage,
        practiceWordsPerSession: profile.practiceWordsPerSession
      },
      nativeLanguageOptions: NATIVE_LANGUAGE_OPTIONS
    });
    return true;
  };
}

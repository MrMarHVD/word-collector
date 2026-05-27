import { STUDY_LANGUAGE_OPTIONS } from "../../config.js";
import { getLanguages } from "../../modules/languages/languages.service.js";
import { jsonResponse } from "../response.js";

export function createLanguagesRoutes({ repositories }) {
  return async function handleLanguagesRoutes(req, res, url, user) {
    if (req.method !== "GET" || url.pathname !== "/api/languages") {
      return false;
    }

    jsonResponse(res, 200, {
      languages: getLanguages(repositories, user.userId),
      predefinedLanguages: repositories.languages.listPredefined(),
      studyLanguageOptions: STUDY_LANGUAGE_OPTIONS
    });
    return true;
  };
}

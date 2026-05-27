import { STUDY_LANGUAGE_OPTIONS } from "../../config.js";
import { addStudyLanguageForUser, getLanguages } from "../../modules/languages/languages.service.js";
import { readJson } from "../request.js";
import { jsonResponse } from "../response.js";

function buildLanguagesPayload(repositories, userId) {
  return {
    languages: getLanguages(repositories, userId),
    predefinedLanguages: repositories.languages.listPredefined(),
    studyLanguageOptions: STUDY_LANGUAGE_OPTIONS
  };
}

export function createLanguagesRoutes({ repositories }) {
  return async function handleLanguagesRoutes(req, res, url, user) {
    if (url.pathname !== "/api/languages") {
      return false;
    }

    if (req.method === "GET") {
      jsonResponse(res, 200, buildLanguagesPayload(repositories, user.userId));
      return true;
    }

    if (req.method === "POST") {
      const body = await readJson(req);
      const result = addStudyLanguageForUser(repositories, user.userId, body.name);
      if (result.error) {
        jsonResponse(res, 400, { error: result.error });
        return true;
      }
      jsonResponse(res, 201, {
        ...buildLanguagesPayload(repositories, user.userId),
        language: result.language
      });
      return true;
    }

    return false;
  };
}

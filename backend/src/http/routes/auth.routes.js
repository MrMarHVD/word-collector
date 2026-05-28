import { clearAuthCookie } from "../../auth/session.js";
import { NATIVE_LANGUAGE_OPTIONS, STUDY_LANGUAGE_OPTIONS } from "../../config.js";
import { getAuthContext, loginUser, registerUser } from "../../modules/auth/auth.service.js";
import { readJson } from "../request.js";
import { jsonResponse } from "../response.js";

export function createAuthRoutes({ repositories, getAuthenticatedUser, setJwtForUser }) {
  return async function handleAuthRoutes(req, res, url) {
    if (req.method === "GET" && url.pathname === "/api/auth/me") {
      const user = getAuthenticatedUser(req);
      if (!user) {
        jsonResponse(res, 200, {
          user: null,
          languages: [],
          predefinedLanguages: repositories.languages.listPredefined(),
          studyLanguageOptions: STUDY_LANGUAGE_OPTIONS,
          nativeLanguageOptions: NATIVE_LANGUAGE_OPTIONS
        });
        return true;
      }
      const context = getAuthContext(repositories, user.userId);
      jsonResponse(res, 200, {
        ...context,
        studyLanguageOptions: STUDY_LANGUAGE_OPTIONS,
        nativeLanguageOptions: NATIVE_LANGUAGE_OPTIONS
      });
      return true;
    }

    if (req.method === "POST" && url.pathname === "/api/auth/login") {
      const body = await readJson(req);
      const result = loginUser(repositories, body.email, body.password);
      if (result.error) {
        jsonResponse(res, result.status, { error: result.error });
        return true;
      }
      setJwtForUser(res, result.user);
      jsonResponse(res, 200, { user: { id: result.user.id, email: result.user.email, nativeLanguage: result.user.nativeLanguage, practiceWordsPerSession: result.user.practiceWordsPerSession } });
      return true;
    }

    if (req.method === "POST" && url.pathname === "/api/auth/register") {
      const body = await readJson(req);
      const result = registerUser(repositories, body.email, body.password, body.confirmPassword);
      if (result.error) {
        jsonResponse(res, result.status, { error: result.error });
        return true;
      }
      setJwtForUser(res, result.user);
      jsonResponse(res, 201, { user: { id: result.user.id, email: result.user.email, nativeLanguage: result.user.nativeLanguage, practiceWordsPerSession: result.user.practiceWordsPerSession } });
      return true;
    }

    if (req.method === "POST" && url.pathname === "/api/auth/logout") {
      clearAuthCookie(res);
      jsonResponse(res, 200, { loggedOut: true });
      return true;
    }

    return false;
  };
}

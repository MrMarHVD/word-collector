import { NATIVE_LANGUAGE_OPTIONS } from "../../config.js";
import { clearAuthCookie } from "../../auth/session.js";
import { changePassword, deleteAccount } from "../../modules/auth/auth.service.js";
import { normalizeWordsPerSession } from "../../modules/practice/practice.service.js";
import { backfillUserTranslations } from "../../modules/translations/translations.service.js";
import { readJson } from "../request.js";
import { jsonResponse } from "../response.js";

export function createSettingsRoutes({ repositories, session }) {
  return async function handleSettingsRoutes(req, res, url, user) {
    // Change the signed-in user's password. After success, revoke every session
    // (logging out other devices) and reissue a fresh one for this device.
    if (req.method === "POST" && url.pathname === "/api/settings/password") {
      const body = await readJson(req);
      const result = await changePassword(repositories, user.userId, body.currentPassword, body.newPassword, body.confirmPassword);
      if (result.error) {
        jsonResponse(res, result.status, { error: result.error, errorKey: result.errorKey });
        return true;
      }
      await session.destroyAllUserSessions(user.userId);
      const nextSession = await session.createSessionForUser(res, { id: user.userId });
      jsonResponse(res, 200, { changed: true, csrfToken: nextSession.csrfToken });
      return true;
    }

    if (req.method === "DELETE" && url.pathname === "/api/settings/account") {
      const body = await readJson(req);
      const result = await deleteAccount(repositories, user.userId, body.confirmation);
      if (result.error) {
        jsonResponse(res, result.status, { error: result.error, errorKey: result.errorKey });
        return true;
      }
      clearAuthCookie(res);
      jsonResponse(res, 200, { deleted: true, csrfToken: null });
      return true;
    }

    if (req.method !== "PATCH" || url.pathname !== "/api/settings") {
      return false;
    }

    const body = await readJson(req);
    if (body.nativeLanguage !== undefined && body.nativeLanguage !== null) {
      const nativeLanguage = String(body.nativeLanguage || "");
      if (!NATIVE_LANGUAGE_OPTIONS.includes(nativeLanguage)) {
        jsonResponse(res, 400, { error: "Unsupported native language." });
        return true;
      }
      await repositories.auth.updateNativeLanguage(nativeLanguage, user.userId);
      await backfillUserTranslations(repositories, user.userId, nativeLanguage);
    }

    if (body.practiceWordsPerSession !== undefined && body.practiceWordsPerSession !== null) {
      await repositories.auth.updatePracticeWordsPerSession(normalizeWordsPerSession(body.practiceWordsPerSession), user.userId);
    }

    const profile = await repositories.auth.findUserById(user.userId);
    jsonResponse(res, 200, {
      user: {
        id: user.userId,
        email: user.email,
        displayName: profile.displayName || "",
        createdAt: profile.createdAt,
        nativeLanguage: profile.nativeLanguage,
        practiceWordsPerSession: profile.practiceWordsPerSession,
        emailVerified: profile.emailVerified === true,
        hasPassword: profile.hasPassword === true,
        hasGoogle: profile.hasGoogle === true
      },
      nativeLanguageOptions: NATIVE_LANGUAGE_OPTIONS
    });
    return true;
  };
}

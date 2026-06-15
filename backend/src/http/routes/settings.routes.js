/**
 * @fileoverview Route handlers for user account settings (`/api/settings`).
 *
 * Covers the three settings operations exposed to users: updating account
 * preferences (native language, practice session size), changing the account
 * password, and permanently deleting the account.
 *
 * Password change revokes all existing sessions and issues a fresh one for the
 * current device so the user is not immediately logged out after the change.
 * Account deletion clears the auth cookie so the browser's session is also
 * terminated immediately.
 */

import { NATIVE_LANGUAGE_OPTIONS } from "../../config.js";
import { clearAuthCookie } from "../../auth/session.js";
import { changePassword, deleteAccount } from "../../modules/auth/auth.service.js";
import { normalizeWordsPerSession } from "../../modules/practice/practice.service.js";
import { backfillUserTranslations } from "../../modules/translations/translations.service.js";
import { readJson } from "../request.js";
import { jsonResponse } from "../response.js";

/**
 * Creates route handlers for `/api/settings`, `/api/settings/password`, and
 * `/api/settings/account`.
 *
 * **POST /api/settings/password**
 * Changes the authenticated user's password. On success, all sessions for the
 * user are revoked and a new session is issued for the current device. The new
 * CSRF token must be used for all subsequent unsafe requests.
 * - Body: `{ currentPassword: string, newPassword: string, confirmPassword: string }`
 * - Response 200: `{ changed: true, csrfToken: string }`
 * - Response 400/401: wrong current password or validation failure.
 *
 * **DELETE /api/settings/account**
 * Permanently deletes the user account and all associated data. The client must
 * send a confirmation string matching the expected value (verified by the service).
 * Clears the auth cookie so the browser session ends immediately.
 * - Body: `{ confirmation: string }`
 * - Response 200: `{ deleted: true, csrfToken: null }`
 * - Response 400: confirmation value does not match.
 *
 * **PATCH /api/settings**
 * Updates one or more user preferences. Unknown fields are silently ignored.
 * When `nativeLanguage` changes, translations for all existing words are
 * backfilled asynchronously via `backfillUserTranslations`.
 * - Body (all fields optional): `{ nativeLanguage?: string, practiceWordsPerSession?: number }`
 * - Response 200: `{ user: UserProfile, nativeLanguageOptions: string[] }`
 * - Response 400: unsupported `nativeLanguage` value.
 *
 * @param {Object} deps
 * @param {import("../../db/repositories.js").Repositories} deps.repositories
 * @param {import("../../auth/session.js").SessionHelpers} deps.session - Session helpers used to
 *   revoke all sessions and reissue a fresh one after password changes.
 * @returns {(req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse, url: URL, user: import("../../auth/session.js").SessionUser) => Promise<boolean>}
 */
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

/**
 * @fileoverview Auth repository. All SQL persistence for users, sessions,
 * single-use auth tokens, and OAuth accounts. Tables: `users`, `sessions`,
 * `auth_tokens`, `oauth_accounts`.
 *
 * Sessions are opaque and server-side: the stored `id` is the SHA-256 hash of
 * the raw cookie value so a leaked database row cannot replay the session.
 * Auth tokens (email verification, password reset) are similarly stored as
 * their hash and are single-use.
 */

/**
 * Build the auth repository bound to the given database executor.
 *
 * @param {object} db - Prepared-statement executor (same interface as `better-sqlite3`).
 * @returns {object} Repository with user, session, auth-token, and OAuth CRUD methods.
 */
export function createAuthRepository(db) {
  const userSelect = `SELECT u.id, u.email, u.created_at AS "createdAt", u.native_language AS "nativeLanguage", u.practice_words_per_session AS "practiceWordsPerSession", u.email_verified AS "emailVerified", (u.password_hash IS NOT NULL AND u.password_salt IS NOT NULL) AS "hasPassword", EXISTS (SELECT 1 FROM oauth_accounts oa WHERE oa.user_id = u.id AND oa.provider = 'google') AS "hasGoogle", (SELECT oa.display_name FROM oauth_accounts oa WHERE oa.user_id = u.id AND oa.provider = 'google' LIMIT 1) AS "displayName"`;
  const userByEmail = db.prepare(`${userSelect}, u.password_hash AS "passwordHash", u.password_salt AS "passwordSalt" FROM users u WHERE lower(u.email) = lower(?)`);
  const userById = db.prepare(`${userSelect} FROM users u WHERE u.id = ?`);
  const userSecretById = db.prepare(`SELECT id, email, email_verified AS "emailVerified", password_hash AS "passwordHash", password_salt AS "passwordSalt" FROM users WHERE id = ?`);
  const createUser = db.prepare("INSERT INTO users (email, password_hash, password_salt) VALUES (?, ?, ?)");
  const createOAuthUser = db.prepare("INSERT INTO users (email, email_verified) VALUES (?, true)");
  const updateNativeLanguage = db.prepare("UPDATE users SET native_language = ? WHERE id = ?");
  const updatePracticeWordsPerSession = db.prepare("UPDATE users SET practice_words_per_session = ? WHERE id = ?");
  const updatePassword = db.prepare("UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?");
  const clearPassword = db.prepare("UPDATE users SET password_hash = NULL, password_salt = NULL WHERE id = ?");
  const markEmailVerified = db.prepare("UPDATE users SET email_verified = true WHERE id = ?");
  const oauthAccountByProviderUser = db.prepare(`SELECT user_id AS "userId", provider, provider_user_id AS "providerUserId", email, display_name AS "displayName" FROM oauth_accounts WHERE provider = ? AND provider_user_id = ?`);
  const createOAuthAccount = db.prepare("INSERT INTO oauth_accounts (user_id, provider, provider_user_id, email, display_name) VALUES (?, ?, ?, ?, ?) ON CONFLICT (provider, provider_user_id) DO UPDATE SET email = EXCLUDED.email, display_name = EXCLUDED.display_name, updated_at = now()");

  // Sessions: opaque, server-side, revocable. `id` is the SHA-256 hash of the
  // raw token held in the user's cookie.
  const insertSession = db.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)");
  const sessionUser = db.prepare(`SELECT u.id, u.email, u.native_language AS "nativeLanguage", u.email_verified AS "emailVerified", (u.password_hash IS NOT NULL AND u.password_salt IS NOT NULL) AS "hasPassword", EXISTS (SELECT 1 FROM oauth_accounts oa WHERE oa.user_id = u.id AND oa.provider = 'google') AS "hasGoogle" FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND s.expires_at > now()`);
  const deleteSession = db.prepare("DELETE FROM sessions WHERE id = ?");
  const deleteUserSessions = db.prepare("DELETE FROM sessions WHERE user_id = ?");
  const deleteOtherUserSessions = db.prepare("DELETE FROM sessions WHERE user_id = ? AND id <> ?");

  // Auth tokens: single-use, expiring. `id` is the SHA-256 hash of the raw
  // token sent in the email link.
  const insertToken = db.prepare("INSERT INTO auth_tokens (id, user_id, type, expires_at) VALUES (?, ?, ?, ?)");
  const findToken = db.prepare(`SELECT id, user_id AS "userId", type, expires_at AS "expiresAt", used_at AS "usedAt" FROM auth_tokens WHERE id = ? AND type = ?`);
  const markTokenUsed = db.prepare("UPDATE auth_tokens SET used_at = now() WHERE id = ?");
  const deleteUserTokensOfType = db.prepare("DELETE FROM auth_tokens WHERE user_id = ? AND type = ?");

  const deleteUserMaterialTokens = db.prepare(`
    DELETE FROM material_tokens
    WHERE material_id IN (SELECT id FROM materials WHERE user_id = ?)
  `);
  const deleteUserMaterials = db.prepare("DELETE FROM materials WHERE user_id = ?");
  // Words, translations, and languages are global and shared, so account
  // deletion only removes this user's overlay: their word memberships,
  // collections, and language enrolments. The shared catalogue is left intact.
  const deleteUserWords = db.prepare("DELETE FROM user_words WHERE user_id = ?");
  const deleteUserCollections = db.prepare("DELETE FROM collections WHERE user_id = ?");
  const deleteUserLanguages = db.prepare("DELETE FROM user_languages WHERE user_id = ?");
  const deleteUserAuthTokens = db.prepare("DELETE FROM auth_tokens WHERE user_id = ?");
  const deleteUserOAuthAccounts = db.prepare("DELETE FROM oauth_accounts WHERE user_id = ?");
  const deleteUser = db.prepare("DELETE FROM users WHERE id = ?");

  return {
    /**
     * Look up a user row by email (case-insensitive), including password credentials.
     * Queries: `users`.
     * @param {string} email
     * @returns {object|undefined}
     */
    findUserByEmail(email) {
      return userByEmail.get(email);
    },
    /**
     * Fetch a public user profile by id. Does not include password fields.
     * Queries: `users`, `oauth_accounts`.
     * @param {number} userId
     * @returns {object|undefined}
     */
    findUserById(userId) {
      return userById.get(userId);
    },
    /**
     * Fetch a user row including its password hash and salt for credential verification.
     * Queries: `users`.
     * @param {number} userId
     * @returns {object|undefined}
     */
    findUserSecretById(userId) {
      return userSecretById.get(userId);
    },
    /**
     * Insert a new password-based user account.
     * Inserts into: `users`.
     * @param {string} email
     * @param {string} passwordHash
     * @param {string} passwordSalt
     * @returns {object} SQLite run result.
     */
    createUser(email, passwordHash, passwordSalt) {
      return createUser.run(email, passwordHash, passwordSalt);
    },
    /**
     * Insert a new OAuth-only user account with `email_verified = true`.
     * Inserts into: `users`.
     * @param {string} email
     * @returns {object} SQLite run result.
     */
    createOAuthUser(email) {
      return createOAuthUser.run(email);
    },
    /**
     * Persist the user's chosen native language.
     * Updates: `users`.
     * @param {string} nativeLanguage
     * @param {number} userId
     * @returns {object} SQLite run result.
     */
    updateNativeLanguage(nativeLanguage, userId) {
      return updateNativeLanguage.run(nativeLanguage, userId);
    },
    /**
     * Persist the user's preferred number of words per practice session.
     * Updates: `users`.
     * @param {number} practiceWordsPerSession
     * @param {number} userId
     * @returns {object} SQLite run result.
     */
    updatePracticeWordsPerSession(practiceWordsPerSession, userId) {
      return updatePracticeWordsPerSession.run(practiceWordsPerSession, userId);
    },
    /**
     * Replace the user's stored password hash and salt.
     * Updates: `users`.
     * @param {string} passwordHash
     * @param {string} passwordSalt
     * @param {number} userId
     * @returns {object} SQLite run result.
     */
    updatePassword(passwordHash, passwordSalt, userId) {
      return updatePassword.run(passwordHash, passwordSalt, userId);
    },
    /**
     * Remove the user's password credentials, leaving the account OAuth-only.
     * Updates: `users`.
     * @param {number} userId
     * @returns {object} SQLite run result.
     */
    clearPassword(userId) {
      return clearPassword.run(userId);
    },
    /**
     * Mark the user's email address as verified.
     * Updates: `users`.
     * @param {number} userId
     * @returns {object} SQLite run result.
     */
    markEmailVerified(userId) {
      return markEmailVerified.run(userId);
    },
    /**
     * Find an OAuth account by provider and provider-assigned user id.
     * Queries: `oauth_accounts`.
     * @param {string} provider - e.g. `"google"`.
     * @param {string} providerUserId
     * @returns {object|undefined}
     */
    findOAuthAccount(provider, providerUserId) {
      return oauthAccountByProviderUser.get(provider, providerUserId);
    },
    /**
     * Upsert an OAuth account link. Updates email and display name when the
     * provider/providerUserId pair already exists.
     * Upserts into: `oauth_accounts`.
     * @param {number} userId
     * @param {string} provider
     * @param {string} providerUserId
     * @param {string} email
     * @param {string} [displayName=""]
     * @returns {object} SQLite run result.
     */
    createOAuthAccount(userId, provider, providerUserId, email, displayName = "") {
      return createOAuthAccount.run(userId, provider, providerUserId, email, displayName);
    },

    /**
     * Insert a new session row. `id` must be the SHA-256 hash of the raw cookie token.
     * Inserts into: `sessions`.
     * @param {string} id - SHA-256 hash of the raw token.
     * @param {number} userId
     * @param {string} expiresAt - ISO-8601 timestamp.
     * @returns {object} SQLite run result.
     */
    createSession(id, userId, expiresAt) {
      return insertSession.run(id, userId, expiresAt);
    },
    /**
     * Resolve a non-expired session to its owning user profile.
     * Queries: `sessions` JOIN `users`.
     * @param {string} id - SHA-256 hash of the raw cookie token.
     * @returns {object|undefined} User profile, or undefined when the session
     *   is absent or expired.
     */
    findSessionUser(id) {
      return sessionUser.get(id);
    },
    /**
     * Delete a single session (sign-out).
     * Deletes from: `sessions`.
     * @param {string} id
     * @returns {object} SQLite run result.
     */
    deleteSession(id) {
      return deleteSession.run(id);
    },
    /**
     * Delete all sessions for a user (forced sign-out from every device).
     * Deletes from: `sessions`.
     * @param {number} userId
     * @returns {object} SQLite run result.
     */
    deleteUserSessions(userId) {
      return deleteUserSessions.run(userId);
    },
    /**
     * Delete all sessions for a user except the one currently in use.
     * Deletes from: `sessions`.
     * @param {number} userId
     * @param {string} keepId - Session id to preserve.
     * @returns {object} SQLite run result.
     */
    deleteOtherUserSessions(userId, keepId) {
      return deleteOtherUserSessions.run(userId, keepId);
    },

    /**
     * Insert a single-use auth token. `id` must be the SHA-256 hash of the raw
     * value sent in the email link.
     * Inserts into: `auth_tokens`.
     * @param {string} id - SHA-256 hash of the raw token.
     * @param {number} userId
     * @param {string} type - One of `TOKEN_TYPES` (e.g. `"email_verification"`).
     * @param {string} expiresAt - ISO-8601 timestamp.
     * @returns {object} SQLite run result.
     */
    createAuthToken(id, userId, type, expiresAt) {
      return insertToken.run(id, userId, type, expiresAt);
    },
    /**
     * Look up an auth token row by hash and type.
     * Queries: `auth_tokens`.
     * @param {string} id - SHA-256 hash of the raw token.
     * @param {string} type
     * @returns {object|undefined}
     */
    findAuthToken(id, type) {
      return findToken.get(id, type);
    },
    /**
     * Stamp an auth token as consumed so it cannot be reused.
     * Updates: `auth_tokens`.
     * @param {string} id
     * @returns {object} SQLite run result.
     */
    markAuthTokenUsed(id) {
      return markTokenUsed.run(id);
    },
    /**
     * Delete all outstanding tokens of a given type for a user (e.g. supersede
     * old verification links before issuing a new one).
     * Deletes from: `auth_tokens`.
     * @param {number} userId
     * @param {string} type
     * @returns {object} SQLite run result.
     */
    deleteUserTokensOfType(userId, type) {
      return deleteUserTokensOfType.run(userId, type);
    },
    /**
     * Hard-delete all data owned by a user in cascade order, then remove the
     * user row itself. Shared catalogue data (global words, translations,
     * languages) is left intact; only the user's memberships and private data
     * are removed.
     * Deletes from: `material_tokens`, `materials`, `user_words`, `collections`,
     * `user_languages`, `auth_tokens`, `oauth_accounts`, `sessions`, `users`.
     * @param {number} userId
     * @returns {Promise<object>} SQLite run result of the final `DELETE FROM users`.
     */
    async deleteUserAccountData(userId) {
      await deleteUserMaterialTokens.run(userId);
      await deleteUserMaterials.run(userId);
      await deleteUserWords.run(userId);
      await deleteUserCollections.run(userId);
      await deleteUserLanguages.run(userId);
      await deleteUserAuthTokens.run(userId);
      await deleteUserOAuthAccounts.run(userId);
      await deleteUserSessions.run(userId);
      return deleteUser.run(userId);
    }
  };
}

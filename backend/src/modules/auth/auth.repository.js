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

  return {
    findUserByEmail(email) {
      return userByEmail.get(email);
    },
    findUserById(userId) {
      return userById.get(userId);
    },
    findUserSecretById(userId) {
      return userSecretById.get(userId);
    },
    createUser(email, passwordHash, passwordSalt) {
      return createUser.run(email, passwordHash, passwordSalt);
    },
    createOAuthUser(email) {
      return createOAuthUser.run(email);
    },
    updateNativeLanguage(nativeLanguage, userId) {
      return updateNativeLanguage.run(nativeLanguage, userId);
    },
    updatePracticeWordsPerSession(practiceWordsPerSession, userId) {
      return updatePracticeWordsPerSession.run(practiceWordsPerSession, userId);
    },
    updatePassword(passwordHash, passwordSalt, userId) {
      return updatePassword.run(passwordHash, passwordSalt, userId);
    },
    clearPassword(userId) {
      return clearPassword.run(userId);
    },
    markEmailVerified(userId) {
      return markEmailVerified.run(userId);
    },
    findOAuthAccount(provider, providerUserId) {
      return oauthAccountByProviderUser.get(provider, providerUserId);
    },
    createOAuthAccount(userId, provider, providerUserId, email, displayName = "") {
      return createOAuthAccount.run(userId, provider, providerUserId, email, displayName);
    },

    createSession(id, userId, expiresAt) {
      return insertSession.run(id, userId, expiresAt);
    },
    findSessionUser(id) {
      return sessionUser.get(id);
    },
    deleteSession(id) {
      return deleteSession.run(id);
    },
    deleteUserSessions(userId) {
      return deleteUserSessions.run(userId);
    },
    deleteOtherUserSessions(userId, keepId) {
      return deleteOtherUserSessions.run(userId, keepId);
    },

    createAuthToken(id, userId, type, expiresAt) {
      return insertToken.run(id, userId, type, expiresAt);
    },
    findAuthToken(id, type) {
      return findToken.get(id, type);
    },
    markAuthTokenUsed(id) {
      return markTokenUsed.run(id);
    },
    deleteUserTokensOfType(userId, type) {
      return deleteUserTokensOfType.run(userId, type);
    }
  };
}

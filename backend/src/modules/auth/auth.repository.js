export function createAuthRepository(db) {
  const userByEmail = db.prepare(`SELECT id, email, native_language AS "nativeLanguage", practice_words_per_session AS "practiceWordsPerSession", email_verified AS "emailVerified", password_hash AS "passwordHash", password_salt AS "passwordSalt" FROM users WHERE lower(email) = lower(?)`);
  const userById = db.prepare(`SELECT id, email, native_language AS "nativeLanguage", practice_words_per_session AS "practiceWordsPerSession", email_verified AS "emailVerified" FROM users WHERE id = ?`);
  const userSecretById = db.prepare(`SELECT id, email, email_verified AS "emailVerified", password_hash AS "passwordHash", password_salt AS "passwordSalt" FROM users WHERE id = ?`);
  const createUser = db.prepare("INSERT INTO users (email, password_hash, password_salt) VALUES (?, ?, ?)");
  const updateNativeLanguage = db.prepare("UPDATE users SET native_language = ? WHERE id = ?");
  const updatePracticeWordsPerSession = db.prepare("UPDATE users SET practice_words_per_session = ? WHERE id = ?");
  const updatePassword = db.prepare("UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?");
  const markEmailVerified = db.prepare("UPDATE users SET email_verified = true WHERE id = ?");

  // Sessions: opaque, server-side, revocable. `id` is the SHA-256 hash of the
  // raw token held in the user's cookie.
  const insertSession = db.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)");
  const sessionUser = db.prepare(`SELECT u.id, u.email, u.native_language AS "nativeLanguage", u.email_verified AS "emailVerified" FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND s.expires_at > now()`);
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
    updateNativeLanguage(nativeLanguage, userId) {
      return updateNativeLanguage.run(nativeLanguage, userId);
    },
    updatePracticeWordsPerSession(practiceWordsPerSession, userId) {
      return updatePracticeWordsPerSession.run(practiceWordsPerSession, userId);
    },
    updatePassword(passwordHash, passwordSalt, userId) {
      return updatePassword.run(passwordHash, passwordSalt, userId);
    },
    markEmailVerified(userId) {
      return markEmailVerified.run(userId);
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

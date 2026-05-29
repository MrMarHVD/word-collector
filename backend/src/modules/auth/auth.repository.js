export function createAuthRepository(db) {
  const userByEmail = db.prepare(`SELECT id, email, native_language AS "nativeLanguage", practice_words_per_session AS "practiceWordsPerSession", password_hash AS "passwordHash", password_salt AS "passwordSalt" FROM users WHERE lower(email) = lower(?)`);
  const userById = db.prepare(`SELECT id, email, native_language AS "nativeLanguage", practice_words_per_session AS "practiceWordsPerSession" FROM users WHERE id = ?`);
  const createUser = db.prepare("INSERT INTO users (email, password_hash, password_salt) VALUES (?, ?, ?)");
  const updateNativeLanguage = db.prepare("UPDATE users SET native_language = ? WHERE id = ?");
  const updatePracticeWordsPerSession = db.prepare("UPDATE users SET practice_words_per_session = ? WHERE id = ?");

  return {
    findUserByEmail(email) {
      return userByEmail.get(email);
    },
    findUserById(userId) {
      return userById.get(userId);
    },
    createUser(email, passwordHash, passwordSalt) {
      return createUser.run(email, passwordHash, passwordSalt);
    },
    updateNativeLanguage(nativeLanguage, userId) {
      return updateNativeLanguage.run(nativeLanguage, userId);
    },
    updatePracticeWordsPerSession(practiceWordsPerSession, userId) {
      return updatePracticeWordsPerSession.run(practiceWordsPerSession, userId);
    }
  };
}

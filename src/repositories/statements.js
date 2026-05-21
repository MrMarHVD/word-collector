export function createStatements(db) {
  return {
    userByEmail: db.prepare("SELECT id, email, password_hash AS passwordHash, password_salt AS passwordSalt FROM users WHERE lower(email) = lower(?)"),
    userById: db.prepare("SELECT id, email FROM users WHERE id = ?"),
    createUser: db.prepare("INSERT INTO users (email, password_hash, password_salt) VALUES (?, ?, ?)"),
    predefinedLanguages: db.prepare("SELECT id, name FROM predefined_languages ORDER BY lower(name)"),
    predefinedLanguageById: db.prepare("SELECT id, name FROM predefined_languages WHERE id = ?"),
    languageById: db.prepare("SELECT id, user_id AS userId, name FROM languages WHERE id = ? AND user_id = ?"),
    languageByName: db.prepare("SELECT id, user_id AS userId, name FROM languages WHERE user_id = ? AND lower(name) = lower(?)"),
    createLanguage: db.prepare("INSERT INTO languages (user_id, name) VALUES (?, ?)"),
    collectionByName: db.prepare(`
      SELECT c.id, c.name, c.language_id AS languageId, l.name AS languageName
      FROM collections c
      JOIN languages l ON l.id = c.language_id
      WHERE l.user_id = ? AND c.language_id = ? AND lower(c.name) = lower(?)
    `),
    collectionById: db.prepare(`
      SELECT c.id, c.name, c.language_id AS languageId, l.name AS languageName
      FROM collections c
      JOIN languages l ON l.id = c.language_id
      WHERE c.id = ? AND l.user_id = ?
    `),
    createCollection: db.prepare("INSERT INTO collections (language_id, name) VALUES (?, ?)"),
    deleteCollection: db.prepare("DELETE FROM collections WHERE id = ?"),
    updateCollectionLanguage: db.prepare("UPDATE collections SET language_id = ? WHERE id = ?"),
    insertWord: db.prepare(`
      INSERT INTO words (collection_id, word, translation)
      VALUES (?, ?, ?)
      ON CONFLICT(collection_id, word, translation) DO NOTHING
    `),
    upsertKnown: db.prepare(`
      INSERT INTO user_word_status (user_id, word_id, known, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id, word_id) DO UPDATE SET known = excluded.known, updated_at = CURRENT_TIMESTAMP
    `),
    wordById: db.prepare(`
      SELECT w.id, w.collection_id AS collectionId, w.word, w.translation, COALESCE(uws.known, 0) AS known
      FROM words w
      JOIN collections c ON c.id = w.collection_id
      JOIN languages l ON l.id = c.language_id
      LEFT JOIN user_word_status uws ON uws.word_id = w.id AND uws.user_id = ?
      WHERE w.id = ? AND l.user_id = ?
    `)
  };
}

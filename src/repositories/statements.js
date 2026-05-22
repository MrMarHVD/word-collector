export function createStatements(db) {
  return {
    userByEmail: db.prepare("SELECT id, email, native_language AS nativeLanguage, password_hash AS passwordHash, password_salt AS passwordSalt FROM users WHERE lower(email) = lower(?)"),
    userById: db.prepare("SELECT id, email, native_language AS nativeLanguage FROM users WHERE id = ?"),
    createUser: db.prepare("INSERT INTO users (email, password_hash, password_salt) VALUES (?, ?, ?)"),
    updateNativeLanguage: db.prepare("UPDATE users SET native_language = ? WHERE id = ?"),
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
      INSERT INTO words (collection_id, word, translation, lemma)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(collection_id, word, translation) DO NOTHING
    `),
    wordInLanguageBySurfaceOrLemma: db.prepare(`
      SELECT w.id, w.word, w.translation, w.lemma, c.id AS collectionId, c.name AS collectionName
      FROM words w
      JOIN collections c ON c.id = w.collection_id
      JOIN languages l ON l.id = c.language_id
      WHERE l.user_id = ? AND l.id = ? AND (lower(w.word) = lower(?) OR lower(COALESCE(w.lemma, w.word)) = lower(?))
      ORDER BY CASE WHEN lower(c.name) = 'uncollected' THEN 1 ELSE 0 END,
               CASE WHEN lower(w.word) = lower(?) THEN 0 ELSE 1 END,
               lower(c.name)
      LIMIT 1
    `),
    wordByCollectionAndLemma: db.prepare(`
      SELECT w.id, w.word, w.translation, w.lemma
      FROM words w
      WHERE w.collection_id = ? AND lower(COALESCE(w.lemma, w.word)) = lower(?)
      LIMIT 1
    `),
    upsertWordTranslation: db.prepare(`
      INSERT INTO word_translations (word_id, native_language, translation, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(word_id, native_language) DO UPDATE SET translation = excluded.translation, updated_at = CURRENT_TIMESTAMP
    `),
    wordTranslation: db.prepare("SELECT translation FROM word_translations WHERE word_id = ? AND native_language = ?"),
    createMaterial: db.prepare(`
      INSERT INTO materials (user_id, language_id, title, file_name, file_type, raw_text, word_count)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `),
    insertMaterialToken: db.prepare(`
      INSERT INTO material_tokens (material_id, position, surface, normalized, lemma, pos, word_id, paragraph_index, sentence_index)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    materialById: db.prepare(`
      SELECT m.id, m.user_id AS userId, m.language_id AS languageId, l.name AS languageName, m.title, m.file_name AS fileName,
             m.file_type AS fileType, m.word_count AS wordCount, m.created_at AS createdAt
      FROM materials m
      JOIN languages l ON l.id = m.language_id
      WHERE m.id = ? AND m.user_id = ?
    `),
    upsertKnown: db.prepare(`
      INSERT INTO user_word_status (user_id, word_id, known, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id, word_id) DO UPDATE SET known = excluded.known, updated_at = CURRENT_TIMESTAMP
    `),
    wordById: db.prepare(`
      SELECT w.id, w.collection_id AS collectionId, w.word, w.translation, COALESCE(w.lemma, w.word) AS lemma, COALESCE(uws.known, 0) AS known
      FROM words w
      JOIN collections c ON c.id = w.collection_id
      JOIN languages l ON l.id = c.language_id
      LEFT JOIN user_word_status uws ON uws.word_id = w.id AND uws.user_id = ?
      WHERE w.id = ? AND l.user_id = ?
    `)
  };
}

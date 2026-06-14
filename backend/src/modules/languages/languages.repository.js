export function createLanguagesRepository(db) {
  const predefinedLanguages = db.prepare("SELECT id, name FROM predefined_languages ORDER BY lower(name)");
  // Languages are global; a user "has" a language through user_languages.
  const languagesByUser = db.prepare(`
    SELECT l.id, l.name
    FROM languages l
    JOIN user_languages ul ON ul.language_id = l.id
    WHERE ul.user_id = ?
    ORDER BY lower(l.name)
  `);
  const languageById = db.prepare(`
    SELECT l.id, ul.user_id AS "userId", l.name
    FROM languages l
    JOIN user_languages ul ON ul.language_id = l.id
    WHERE l.id = ? AND ul.user_id = ?
  `);
  const languageByName = db.prepare(`
    SELECT l.id, ul.user_id AS "userId", l.name
    FROM languages l
    JOIN user_languages ul ON ul.language_id = l.id
    WHERE ul.user_id = ? AND lower(l.name) = lower(?)
  `);
  // Global language identity, created on demand and shared across users.
  const insertGlobalLanguage = db.prepare("INSERT INTO languages (name) VALUES (?) ON CONFLICT (name) DO NOTHING RETURNING id");
  const globalLanguageByName = db.prepare("SELECT id FROM languages WHERE lower(name) = lower(?)");
  const enrollUser = db.prepare("INSERT INTO user_languages (user_id, language_id) VALUES (?, ?) ON CONFLICT DO NOTHING");

  return {
    listPredefined() {
      return predefinedLanguages.all();
    },
    listForUser(userId) {
      return languagesByUser.all(userId);
    },
    findById(languageId, userId) {
      return languageById.get(languageId, userId);
    },
    findByName(userId, name) {
      return languageByName.get(userId, name);
    },
    // Ensure the global language exists, then enrol the user in it.
    async createForUser(userId, name) {
      const inserted = await insertGlobalLanguage.run(name);
      const languageId = inserted.lastInsertRowid || (await globalLanguageByName.get(name))?.id;
      if (!languageId) {
        return { changes: 0 };
      }
      return enrollUser.run(userId, languageId);
    }
  };
}

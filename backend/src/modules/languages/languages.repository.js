export function createLanguagesRepository(db) {
  const predefinedLanguages = db.prepare("SELECT id, name FROM predefined_languages ORDER BY lower(name)");
  const languagesByUser = db.prepare(`
    SELECT id, name
    FROM languages
    WHERE user_id = ?
    ORDER BY lower(name)
  `);
  const languageById = db.prepare("SELECT id, user_id AS userId, name FROM languages WHERE id = ? AND user_id = ?");
  const languageByName = db.prepare("SELECT id, user_id AS userId, name FROM languages WHERE user_id = ? AND lower(name) = lower(?)");
  const createLanguage = db.prepare("INSERT INTO languages (user_id, name) VALUES (?, ?)");

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
    createForUser(userId, name) {
      return createLanguage.run(userId, name);
    }
  };
}

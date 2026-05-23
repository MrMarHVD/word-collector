import { STUDY_LANGUAGE_OPTIONS } from "../config.js";

// Languages are user-owned, while the allowed study-language names are fixed.
export function getLanguages(db, userId) {
  return db.prepare(`
    SELECT id, name
    FROM languages
    WHERE user_id = ?
    ORDER BY lower(name)
  `).all(userId);
}

export function getLanguage(statements, userId, languageId) {
  const id = Number(languageId) || null;
  return id ? statements.languageById.get(id, userId) : null;
}

export function ensureStudyLanguagesForUser(statements, userId) {
  for (const language of STUDY_LANGUAGE_OPTIONS) {
    if (!statements.languageByName.get(userId, language)) {
      statements.createLanguage.run(userId, language);
    }
  }
}

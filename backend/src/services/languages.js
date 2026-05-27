import { STUDY_LANGUAGE_OPTIONS } from "../config.js";

// Languages are user-owned, while the allowed study-language names are fixed.
// Return all languages available to a user in display order.
export function getLanguages(db, userId) {
  return db.prepare(`
    SELECT id, name
    FROM languages
    WHERE user_id = ?
    ORDER BY lower(name)
  `).all(userId);
}

// Resolve a language id only when it belongs to the current user.
export function getLanguage(statements, userId, languageId) {
  const id = Number(languageId) || null;
  return id ? statements.languageById.get(id, userId) : null;
}

// Create the default study languages for a newly registered user.
export function ensureStudyLanguagesForUser(statements, userId) {
  for (const language of STUDY_LANGUAGE_OPTIONS) {
    if (!statements.languageByName.get(userId, language)) {
      statements.createLanguage.run(userId, language);
    }
  }
}

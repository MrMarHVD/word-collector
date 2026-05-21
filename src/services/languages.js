import { normalizeName } from "../shared/normalize.js";

export function getLanguages(db, userId) {
  return db.prepare(`
    SELECT id, name
    FROM languages
    WHERE user_id = ?
    ORDER BY lower(name)
  `).all(userId);
}

export function getOrCreateLanguage(statements, userId, languageName, languageId) {
  const id = Number(languageId) || null;
  if (id) {
    return statements.languageById.get(id, userId);
  }

  const name = normalizeName(languageName);
  if (!name) {
    return null;
  }

  let language = statements.languageByName.get(userId, name);
  if (!language) {
    statements.createLanguage.run(userId, name);
    language = statements.languageByName.get(userId, name);
  }
  return language;
}

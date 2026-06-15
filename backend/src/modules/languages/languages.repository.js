/**
 * @fileoverview Languages repository. SQL persistence for the global language
 * catalogue and user language enrolments. Languages are global records shared
 * across users; a user "has" a language through the `user_languages` join table.
 * Tables: `languages`, `user_languages`, `predefined_languages`.
 */

/**
 * Build the languages repository bound to the given database executor.
 *
 * @param {object} db - Prepared-statement executor.
 * @returns {object} Repository with language CRUD and enrolment methods.
 */
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
    /**
     * List all predefined languages, ordered by name.
     * Queries: `predefined_languages`.
     * @returns {Array<{ id: number, name: string }>}
     */
    listPredefined() {
      return predefinedLanguages.all();
    },
    /**
     * List all languages the user has enrolled in, ordered by name.
     * Queries: `languages` JOIN `user_languages`.
     * @param {number} userId
     * @returns {Array<{ id: number, name: string }>}
     */
    listForUser(userId) {
      return languagesByUser.all(userId);
    },
    /**
     * Find a language by id, scoped to the user's enrolments.
     * Queries: `languages` JOIN `user_languages`.
     * @param {number} languageId
     * @param {number} userId
     * @returns {object|undefined}
     */
    findById(languageId, userId) {
      return languageById.get(languageId, userId);
    },
    /**
     * Find a language by name (case-insensitive), scoped to the user's enrolments.
     * Queries: `languages` JOIN `user_languages`.
     * @param {number} userId
     * @param {string} name
     * @returns {object|undefined}
     */
    findByName(userId, name) {
      return languageByName.get(userId, name);
    },
    /**
     * Ensure the global language record exists, then enrol the user in it.
     * The insert is idempotent on the language name. Returns the enrolment
     * run result, or `{ changes: 0 }` when the language id cannot be resolved.
     * Queries: `languages`, `user_languages`.
     * @param {number} userId
     * @param {string} name
     * @returns {Promise<object>} SQLite run result.
     */
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

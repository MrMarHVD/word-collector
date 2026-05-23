import { STUDY_LANGUAGE_OPTIONS } from "../config.js";
import { getLanguages } from "./languages.js";

// Dashboard rows are shaped for direct use by the browser views.
// Add numeric progress fields that SQL returns as nullable aggregates.
function normalizeCollection(collection) {
  return {
    ...collection,
    totalWords: Number(collection.totalWords || 0),
    knownWords: Number(collection.knownWords || 0),
    unknownWords: Number(collection.totalWords || 0) - Number(collection.knownWords || 0)
  };
}

// Build the dashboard payload for the selected language or all user collections.
export function getDashboard(db, statements, userId, languageId) {
  const selectedLanguageId = Number(languageId) || null;
  const filter = selectedLanguageId ? "WHERE l.user_id = ? AND c.language_id = ?" : "WHERE l.user_id = ?";
  const params = selectedLanguageId ? [userId, selectedLanguageId] : [userId];

  const totals = db.prepare(`
    SELECT
      COUNT(w.id) AS totalWords,
      COALESCE(SUM(CASE WHEN uws.known = 1 THEN 1 ELSE 0 END), 0) AS knownWords
    FROM collections c
    JOIN languages l ON l.id = c.language_id
    LEFT JOIN words w ON w.collection_id = c.id
    LEFT JOIN user_word_status uws ON uws.word_id = w.id AND uws.user_id = ?
    ${filter}
  `).get(userId, ...params);

  const collections = db.prepare(`
    SELECT
      c.id,
      c.name,
      c.language_id AS languageId,
      l.name AS languageName,
      COUNT(w.id) AS totalWords,
      COALESCE(SUM(CASE WHEN uws.known = 1 THEN 1 ELSE 0 END), 0) AS knownWords
    FROM collections c
    JOIN languages l ON l.id = c.language_id
    LEFT JOIN words w ON w.collection_id = c.id
    LEFT JOIN user_word_status uws ON uws.word_id = w.id AND uws.user_id = ?
    ${filter}
    GROUP BY c.id
    ORDER BY lower(l.name), lower(c.name)
  `).all(userId, ...params);

  const allCollections = db.prepare(`
    SELECT
      c.id,
      c.name,
      c.language_id AS languageId,
      l.name AS languageName,
      COUNT(w.id) AS totalWords,
      COALESCE(SUM(CASE WHEN uws.known = 1 THEN 1 ELSE 0 END), 0) AS knownWords
    FROM collections c
    JOIN languages l ON l.id = c.language_id
    LEFT JOIN words w ON w.collection_id = c.id
    LEFT JOIN user_word_status uws ON uws.word_id = w.id AND uws.user_id = ?
    WHERE l.user_id = ?
    GROUP BY c.id
    ORDER BY lower(l.name), lower(c.name)
  `).all(userId, userId);

  return {
    languages: getLanguages(db, userId),
    predefinedLanguages: statements.predefinedLanguages.all(),
    studyLanguageOptions: STUDY_LANGUAGE_OPTIONS,
    selectedLanguageId,
    totalWords: Number(totals.totalWords || 0),
    knownWords: Number(totals.knownWords || 0),
    collections: collections.map(normalizeCollection),
    allCollections: allCollections.map(normalizeCollection)
  };
}

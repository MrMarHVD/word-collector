import { normalizeName } from "../shared/normalize.js";

export function getWords(db, userId, collectionId, search) {
  const term = normalizeName(search);
  if (term) {
    return db.prepare(`
      SELECT w.id, w.collection_id AS collectionId, w.word, w.translation, COALESCE(uws.known, 0) AS known
      FROM words w
      JOIN collections c ON c.id = w.collection_id
      JOIN languages l ON l.id = c.language_id
      LEFT JOIN user_word_status uws ON uws.word_id = w.id AND uws.user_id = ?
      WHERE l.user_id = ? AND w.collection_id = ?
        AND (lower(w.word) LIKE lower(?) OR lower(w.translation) LIKE lower(?))
      ORDER BY lower(w.word), lower(w.translation)
    `).all(userId, userId, collectionId, `%${term}%`, `%${term}%`);
  }

  return db.prepare(`
    SELECT w.id, w.collection_id AS collectionId, w.word, w.translation, COALESCE(uws.known, 0) AS known
    FROM words w
    JOIN collections c ON c.id = w.collection_id
    JOIN languages l ON l.id = c.language_id
    LEFT JOIN user_word_status uws ON uws.word_id = w.id AND uws.user_id = ?
    WHERE l.user_id = ? AND w.collection_id = ?
    ORDER BY lower(w.word), lower(w.translation)
  `).all(userId, userId, collectionId);
}

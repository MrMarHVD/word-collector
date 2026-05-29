function collectionFilter(selectedLanguageId) {
  return selectedLanguageId ? "WHERE l.user_id = ? AND c.language_id = ?" : "WHERE l.user_id = ?";
}

export function createDashboardRepository(db) {
  return {
    getTotals(userId, selectedLanguageId) {
      const filter = collectionFilter(selectedLanguageId);
      const params = selectedLanguageId ? [userId, selectedLanguageId] : [userId];
      return db.prepare(`
        SELECT
          COUNT(w.id) AS "totalWords",
          COALESCE(SUM(CASE WHEN uws.status = 'known' THEN 1 ELSE 0 END), 0) AS "knownWords",
          COALESCE(SUM(CASE WHEN uws.status = 'learning' THEN 1 ELSE 0 END), 0) AS "learningWords"
        FROM collections c
        JOIN languages l ON l.id = c.language_id
        LEFT JOIN words w ON w.collection_id = c.id
        LEFT JOIN user_word_status uws ON uws.word_id = w.id AND uws.user_id = ?
        ${filter}
      `).get(userId, ...params);
    },
    listCollections(userId, selectedLanguageId) {
      const filter = collectionFilter(selectedLanguageId);
      const params = selectedLanguageId ? [userId, selectedLanguageId] : [userId];
      return db.prepare(`
        SELECT
          c.id,
          c.name,
          c.language_id AS "languageId",
          l.name AS "languageName",
          COUNT(w.id) AS "totalWords",
          COALESCE(SUM(CASE WHEN uws.status = 'known' THEN 1 ELSE 0 END), 0) AS "knownWords",
          COALESCE(SUM(CASE WHEN uws.status = 'learning' THEN 1 ELSE 0 END), 0) AS "learningWords"
        FROM collections c
        JOIN languages l ON l.id = c.language_id
        LEFT JOIN words w ON w.collection_id = c.id
        LEFT JOIN user_word_status uws ON uws.word_id = w.id AND uws.user_id = ?
        ${filter}
        GROUP BY c.id, l.name
        ORDER BY lower(l.name), lower(c.name)
      `).all(userId, ...params);
    },
    listAllCollections(userId) {
      return db.prepare(`
        SELECT
          c.id,
          c.name,
          c.language_id AS "languageId",
          l.name AS "languageName",
          COUNT(w.id) AS "totalWords",
          COALESCE(SUM(CASE WHEN uws.status = 'known' THEN 1 ELSE 0 END), 0) AS "knownWords",
          COALESCE(SUM(CASE WHEN uws.status = 'learning' THEN 1 ELSE 0 END), 0) AS "learningWords"
        FROM collections c
        JOIN languages l ON l.id = c.language_id
        LEFT JOIN words w ON w.collection_id = c.id
        LEFT JOIN user_word_status uws ON uws.word_id = w.id AND uws.user_id = ?
        WHERE l.user_id = ?
        GROUP BY c.id, l.name
        ORDER BY lower(l.name), lower(c.name)
      `).all(userId, userId);
    }
  };
}

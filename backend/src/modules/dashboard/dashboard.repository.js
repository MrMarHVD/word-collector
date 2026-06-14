function collectionFilter(selectedLanguageId) {
  return selectedLanguageId ? "WHERE c.user_id = ? AND c.language_id = ?" : "WHERE c.user_id = ?";
}

export function createDashboardRepository(db) {
  return {
    getTotals(userId, selectedLanguageId) {
      const filter = collectionFilter(selectedLanguageId);
      const params = selectedLanguageId ? [userId, selectedLanguageId] : [userId];
      return db.prepare(`
        SELECT
          COUNT(uw.word_id) AS "totalWords",
          COALESCE(SUM(CASE WHEN uw.status = 'known' THEN 1 ELSE 0 END), 0) AS "knownWords",
          COALESCE(SUM(CASE WHEN uw.status = 'learning' THEN 1 ELSE 0 END), 0) AS "learningWords",
          COALESCE(SUM(CASE WHEN uw.want_to_practice = 1 THEN 1 ELSE 0 END), 0) AS "wantToPracticeWords"
        FROM collections c
        LEFT JOIN user_words uw ON uw.collection_id = c.id AND uw.user_id = ?
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
          COUNT(uw.word_id) AS "totalWords",
          COALESCE(SUM(CASE WHEN uw.status = 'known' THEN 1 ELSE 0 END), 0) AS "knownWords",
          COALESCE(SUM(CASE WHEN uw.status = 'learning' THEN 1 ELSE 0 END), 0) AS "learningWords"
        FROM collections c
        JOIN languages l ON l.id = c.language_id
        LEFT JOIN user_words uw ON uw.collection_id = c.id AND uw.user_id = ?
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
          COUNT(uw.word_id) AS "totalWords",
          COALESCE(SUM(CASE WHEN uw.status = 'known' THEN 1 ELSE 0 END), 0) AS "knownWords",
          COALESCE(SUM(CASE WHEN uw.status = 'learning' THEN 1 ELSE 0 END), 0) AS "learningWords"
        FROM collections c
        JOIN languages l ON l.id = c.language_id
        LEFT JOIN user_words uw ON uw.collection_id = c.id AND uw.user_id = ?
        WHERE c.user_id = ?
        GROUP BY c.id, l.name
        ORDER BY lower(l.name), lower(c.name)
      `).all(userId, userId);
    },
    listDocumentStats(userId, selectedLanguageId, search, pageSize, offset) {
      const params = [userId];
      const filters = ["m.user_id = ?"];
      if (selectedLanguageId) {
        filters.push("m.language_id = ?");
        params.push(selectedLanguageId);
      }
      const term = String(search || "").trim();
      if (term) {
        filters.push("(m.title ILIKE ? ESCAPE '\\' OR m.file_name ILIKE ? ESCAPE '\\')");
        const pattern = `%${term.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
        params.push(pattern, pattern);
      }
      params.push(pageSize, offset);

      return db.prepare(`
        SELECT
          m.id,
          m.title,
          m.file_name AS "fileName",
          m.file_type AS "fileType",
          m.word_count AS "importedWordCount",
          m.reader_start AS "readerStart",
          m.created_at AS "createdAt",
          m.import_status AS "importStatus",
          l.name AS "languageName",
          COUNT(mt.id) AS "totalTokens",
          LEAST(m.reader_start, COUNT(mt.id)) AS "readTokens",
          COUNT(DISTINCT mt.word_id) AS "totalWords",
          COUNT(DISTINCT CASE WHEN uw.status = 'known' THEN mt.word_id END) AS "knownWords",
          COUNT(DISTINCT CASE WHEN uw.status = 'learning' THEN mt.word_id END) AS "learningWords"
        FROM materials m
        JOIN languages l ON l.id = m.language_id
        LEFT JOIN material_tokens mt ON mt.material_id = m.id
        LEFT JOIN user_words uw ON uw.word_id = mt.word_id AND uw.user_id = ?
        WHERE ${filters.join(" AND ")}
        GROUP BY m.id, l.name
        ORDER BY m.created_at DESC, m.id DESC
        LIMIT ? OFFSET ?
      `).all(userId, ...params);
    }
  };
}

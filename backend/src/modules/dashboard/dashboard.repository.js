/**
 * @fileoverview Dashboard repository. Aggregation queries that power the
 * Dashboard view: per-user totals and per-collection word-status breakdowns,
 * optionally filtered by language. Tables: `collections`, `user_words`,
 * `languages`, `materials`, `material_tokens`.
 */

function collectionFilter(selectedLanguageId) {
  return selectedLanguageId ? "WHERE c.user_id = ? AND c.language_id = ?" : "WHERE c.user_id = ?";
}

/**
 * Build the dashboard repository bound to the given database executor.
 *
 * @param {object} db - Prepared-statement executor.
 * @returns {object} Repository with aggregation methods for dashboard data.
 */
export function createDashboardRepository(db) {
  return {
    /**
     * Return aggregate word-status counts across all of the user's collections,
     * optionally narrowed to a single language.
     * Queries: `collections` LEFT JOIN `user_words`.
     * @param {number} userId
     * @param {number|null} selectedLanguageId
     * @returns {object} Row with `totalWords`, `knownWords`, `learningWords`, `wantToPracticeWords`.
     */
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
    /**
     * List the user's collections with per-collection word-status counts,
     * optionally filtered to a single language. Ordered alphabetically by
     * language name then collection name.
     * Queries: `collections` JOIN `languages` LEFT JOIN `user_words`.
     * @param {number} userId
     * @param {number|null} selectedLanguageId
     * @returns {object[]} Rows with `id`, `name`, `languageId`, `languageName`,
     *   `totalWords`, `knownWords`, `learningWords`.
     */
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
    /**
     * List every collection the user owns, with word-status counts, across all
     * languages. Used to populate the "move to collection" picker.
     * Queries: `collections` JOIN `languages` LEFT JOIN `user_words`.
     * @param {number} userId
     * @returns {object[]}
     */
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
    /**
     * Return a paginated list of the user's materials with per-document reading
     * progress and word-status counts. Supports optional language and title/filename
     * search filters.
     * Queries: `materials` JOIN `languages` LEFT JOIN `material_tokens` LEFT JOIN `user_words`.
     * @param {number} userId
     * @param {number|null} selectedLanguageId
     * @param {string} search - Substring matched against title and filename.
     * @param {number} pageSize
     * @param {number} offset
     * @returns {object[]} Rows with material metadata, `totalTokens`, `readTokens`,
     *   `totalWords`, `knownWords`, `learningWords`.
     */
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

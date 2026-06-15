/**
 * @fileoverview Materials repository. SQL persistence for uploaded documents
 * and their token streams. Tables: `materials`, `material_tokens`, `languages`.
 * Tracks import progress fields (`import_status`, `import_total`,
 * `import_processed`) and serves the paginated reader token query with
 * per-user word-status and translation resolution.
 */

/**
 * Build the materials repository bound to the given database executor.
 *
 * @param {object} db - Prepared-statement executor.
 * @returns {object} Repository with material and token persistence/retrieval methods.
 */
export function createMaterialsRepository(db) {
  const createMaterial = db.prepare(`
    INSERT INTO materials (user_id, language_id, title, file_name, file_type, raw_text, word_count)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    RETURNING id
  `);
  const insertMaterialToken = db.prepare(`
    INSERT INTO material_tokens (material_id, position, surface, normalized, lemma, pos, word_id, paragraph_index, sentence_index, conjugation_form, block_index, block_type, leading_text, trailing_text)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const materialById = db.prepare(`
    SELECT m.id, m.user_id AS "userId", m.language_id AS "languageId", l.name AS "languageName", m.title, m.file_name AS "fileName",
           m.file_type AS "fileType", m.word_count AS "wordCount", m.reader_start AS "readerStart", m.created_at AS "createdAt",
           m.import_status AS "importStatus", m.import_total AS "importTotal", m.import_processed AS "importProcessed", m.import_error AS "importError"
    FROM materials m
    JOIN languages l ON l.id = m.language_id
    WHERE m.id = ? AND m.user_id = ?
  `);
  const createProcessingMaterial = db.prepare(`
    INSERT INTO materials (user_id, language_id, title, file_name, file_type, raw_text, word_count, import_status, import_total, import_processed)
    VALUES (?, ?, ?, ?, ?, '', 0, 'processing', 0, 0)
    RETURNING id
  `);
  const updateMaterialImportMeta = db.prepare(`
    UPDATE materials SET raw_text = ?, word_count = ?, file_type = ?, import_total = ? WHERE id = ?
  `);
  const updateMaterialImportProcessed = db.prepare("UPDATE materials SET import_processed = ? WHERE id = ?");
  const markMaterialImportReady = db.prepare("UPDATE materials SET import_status = 'ready', import_error = NULL WHERE id = ?");
  const markMaterialImportFailed = db.prepare("UPDATE materials SET import_status = 'failed', import_error = ? WHERE id = ?");
  const updateMaterialReaderStart = db.prepare("UPDATE materials SET reader_start = ? WHERE id = ? AND user_id = ?");
  const updateMaterialTitle = db.prepare("UPDATE materials SET title = ? WHERE id = ? AND user_id = ?");
  const deleteMaterial = db.prepare("DELETE FROM materials WHERE id = ? AND user_id = ?");
  const materialsByUserAndLanguage = db.prepare(`
    SELECT id, title, file_name AS "fileName", file_type AS "fileType", word_count AS "wordCount", reader_start AS "readerStart", created_at AS "createdAt",
           import_status AS "importStatus", import_total AS "importTotal", import_processed AS "importProcessed", import_error AS "importError"
    FROM materials
    WHERE user_id = ? AND language_id = ?
    ORDER BY created_at DESC, id DESC
    LIMIT ? OFFSET ?
  `);
  const materialsByUserLanguageSearch = db.prepare(`
    SELECT id, title, file_name AS "fileName", file_type AS "fileType", word_count AS "wordCount", reader_start AS "readerStart", created_at AS "createdAt",
           import_status AS "importStatus", import_total AS "importTotal", import_processed AS "importProcessed", import_error AS "importError"
    FROM materials
    WHERE user_id = ? AND language_id = ? AND title ILIKE ? ESCAPE '\\'
    ORDER BY created_at DESC, id DESC
    LIMIT ? OFFSET ?
  `);
  const materialsByUser = db.prepare(`
    SELECT m.id, m.user_id AS "userId", m.language_id AS "languageId", l.name AS "languageName", m.title, m.file_name AS "fileName",
           m.file_type AS "fileType", m.word_count AS "wordCount", m.reader_start AS "readerStart", m.created_at AS "createdAt"
    FROM materials m
    JOIN languages l ON l.id = m.language_id
    WHERE m.user_id = ?
    ORDER BY m.created_at DESC, m.id DESC
  `);
  const countMaterialsByUser = db.prepare("SELECT COUNT(*)::int AS count FROM materials WHERE user_id = ?");
  const countProcessingMaterialsByUser = db.prepare("SELECT COUNT(*)::int AS count FROM materials WHERE user_id = ? AND import_status = 'processing'");
  const countProcessingMaterialsGlobal = db.prepare("SELECT COUNT(*)::int AS count FROM materials WHERE import_status = 'processing'");
  const readerTokens = db.prepare(`
    SELECT mt.id, mt.position, mt.surface, mt.lemma, mt.pos, mt.conjugation_form AS "conjugationForm", mt.word_id AS "wordId",
           mt.block_index AS "blockIndex", mt.block_type AS "blockType",
           mt.leading_text AS "leadingText", mt.trailing_text AS "trailingText",
           w.word AS "dictionaryForm",
           w.pos AS "wordPos", w.pos_subcategory AS "posSubcategory", w.reading, w.pinyin, w.traditional,
           CASE
             WHEN w.translation IS NOT NULL AND btrim(w.translation) <> '' AND lower(w.translation) <> lower(w.word) THEN w.translation
             WHEN wt.translation IS NOT NULL AND btrim(wt.translation) <> '' THEN wt.translation
             ELSE w.translation
           END AS "canonicalTranslation",
           uw.translation_override AS "translationOverride",
           CASE
             WHEN uw.translation_override IS NOT NULL AND btrim(uw.translation_override) <> '' THEN uw.translation_override
             WHEN wt.translation IS NOT NULL AND trim(wt.translation) <> '' THEN wt.translation
             WHEN lower(?) = lower(?) THEN w.word
             WHEN ? = 'English' OR lower(?) = 'chinese' THEN w.translation
             ELSE ''
           END AS translation,
           COALESCE(uw.status, 'unknown') AS status,
           COALESCE(uw.want_to_practice, 0) AS "wantToPractice"
    FROM material_tokens mt
    JOIN words w ON w.id = mt.word_id
    LEFT JOIN word_translations wt ON wt.word_id = w.id AND wt.native_language = ?
    LEFT JOIN user_words uw ON uw.word_id = w.id AND uw.user_id = ?
    WHERE mt.material_id = ?
    ORDER BY mt.position
    LIMIT ? OFFSET ?
  `);

  return {
    /**
     * Insert a new material row with raw text and word count (synchronous import path).
     * Inserts into: `materials`.
     * @param {number} userId
     * @param {number} languageId
     * @param {string} title
     * @param {string} fileName
     * @param {string} fileType
     * @param {string} rawText
     * @param {number} wordCount
     * @returns {object} SQLite run result (contains `lastInsertRowid`).
     */
    createMaterial(userId, languageId, title, fileName, fileType, rawText, wordCount) {
      return createMaterial.run(userId, languageId, title, fileName, fileType, rawText, wordCount);
    },
    /**
     * Insert a placeholder material row with `import_status = 'processing'`
     * before the worker thread begins extraction.
     * Inserts into: `materials`.
     * @param {number} userId
     * @param {number} languageId
     * @param {string} title
     * @param {string} fileName
     * @param {string} fileType
     * @returns {object} SQLite run result (contains `lastInsertRowid`).
     */
    createProcessingMaterial(userId, languageId, title, fileName, fileType) {
      return createProcessingMaterial.run(userId, languageId, title, fileName, fileType);
    },
    /**
     * Update the material row with extracted text, word count, file type, and
     * total import count once extraction is complete.
     * Updates: `materials`.
     * @param {number} materialId
     * @param {string} rawText
     * @param {number} wordCount
     * @param {string} fileType
     * @param {number} importTotal
     * @returns {object} SQLite run result.
     */
    updateImportMeta(materialId, rawText, wordCount, fileType, importTotal) {
      return updateMaterialImportMeta.run(rawText, wordCount, fileType, importTotal, materialId);
    },
    /**
     * Update the running count of tokens persisted so far (for polling).
     * Updates: `materials`.
     * @param {number} materialId
     * @param {number} processed
     * @returns {object} SQLite run result.
     */
    setImportProcessed(materialId, processed) {
      return updateMaterialImportProcessed.run(processed, materialId);
    },
    /**
     * Mark the import as complete and clear any previous error.
     * Updates: `materials`.
     * @param {number} materialId
     * @returns {object} SQLite run result.
     */
    markImportReady(materialId) {
      return markMaterialImportReady.run(materialId);
    },
    /**
     * Mark the import as failed and store the error message.
     * Updates: `materials`.
     * @param {number} materialId
     * @param {string} error
     * @returns {object} SQLite run result.
     */
    markImportFailed(materialId, error) {
      return markMaterialImportFailed.run(error, materialId);
    },
    /**
     * Insert a single token row for a material.
     * Inserts into: `material_tokens`.
     * @param {number} materialId
     * @param {object} token - Token object with position, surface, normalized, lemma, pos, etc.
     * @param {number} wordId - Global word id linked to this token.
     * @returns {object} SQLite run result.
     */
    insertMaterialToken(materialId, token, wordId) {
      return insertMaterialToken.run(
        materialId,
        token.position,
        token.surface,
        token.normalized,
        token.lemma,
        token.pos,
        wordId,
        token.paragraphIndex,
        token.sentenceIndex,
        token.conjugationForm || null,
        token.blockIndex ?? null,
        token.blockType ?? null,
        token.leadingText ?? null,
        token.trailingText ?? null
      );
    },
    /**
     * Insert a batch of token rows in a single multi-row statement. No-ops
     * when `entries` is empty.
     * Inserts into: `material_tokens`.
     * @param {number} materialId
     * @param {Array<{ token: object, wordId: number }>} entries - Token/wordId pairs in position order.
     * @returns {object} SQLite run result.
     */
    insertMaterialTokens(materialId, entries) {
      if (!entries.length) {
        return { changes: 0 };
      }
      const params = [];
      const rows = entries.map(({ token, wordId }) => {
        params.push(
          materialId,
          token.position,
          token.surface,
          token.normalized,
          token.lemma,
          token.pos,
          wordId,
          token.paragraphIndex,
          token.sentenceIndex,
          token.conjugationForm || null,
          token.blockIndex ?? null,
          token.blockType ?? null,
          token.leadingText ?? null,
          token.trailingText ?? null
        );
        return "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
      });
      const statement = db.prepare(`
        INSERT INTO material_tokens (material_id, position, surface, normalized, lemma, pos, word_id, paragraph_index, sentence_index, conjugation_form, block_index, block_type, leading_text, trailing_text)
        VALUES ${rows.join(", ")}
      `);
      return statement.run(...params);
    },
    /**
     * Find a material by id, scoped to the owning user.
     * Queries: `materials` JOIN `languages`.
     * @param {number} materialId
     * @param {number} userId
     * @returns {object|undefined}
     */
    findById(materialId, userId) {
      return materialById.get(materialId, userId);
    },
    /**
     * Update the reader bookmark position for a material.
     * Updates: `materials`.
     * @param {number} readerStart - Token position offset.
     * @param {number} materialId
     * @param {number} userId
     * @returns {object} SQLite run result.
     */
    updateReaderStart(readerStart, materialId, userId) {
      return updateMaterialReaderStart.run(readerStart, materialId, userId);
    },
    /**
     * Rename a material.
     * Updates: `materials`.
     * @param {string} title
     * @param {number} materialId
     * @param {number} userId
     * @returns {object} SQLite run result.
     */
    updateTitle(title, materialId, userId) {
      return updateMaterialTitle.run(title, materialId, userId);
    },
    /**
     * Hard-delete a material and its token rows (via cascade).
     * Deletes from: `materials`.
     * @param {number} materialId
     * @param {number} userId
     * @returns {object} SQLite run result.
     */
    deleteById(materialId, userId) {
      return deleteMaterial.run(materialId, userId);
    },
    /**
     * Return a paginated list of materials for a user and language, optionally
     * filtered by title substring.
     * Queries: `materials`.
     * @param {number} userId
     * @param {number} languageId
     * @param {number} pageSize
     * @param {number} offset
     * @param {string} [search=""]
     * @returns {object[]}
     */
    listByUserAndLanguage(userId, languageId, pageSize, offset, search = "") {
      const term = search.trim();
      if (!term) {
        return materialsByUserAndLanguage.all(userId, languageId, pageSize, offset);
      }
      const pattern = `%${term.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
      return materialsByUserLanguageSearch.all(userId, languageId, pattern, pageSize, offset);
    },
    /**
     * List all materials across all languages for a user (used by the
     * translation backfill scan).
     * Queries: `materials` JOIN `languages`.
     * @param {number} userId
     * @returns {object[]}
     */
    listByUser(userId) {
      return materialsByUser.all(userId);
    },
    /**
     * Return the total number of materials the user owns.
     * Queries: `materials`.
     * @param {number} userId
     * @returns {number}
     */
    countByUser(userId) {
      return countMaterialsByUser.get(userId)?.count || 0;
    },
    /**
     * Return the number of materials currently being imported for a user.
     * Queries: `materials`.
     * @param {number} userId
     * @returns {number}
     */
    countProcessingByUser(userId) {
      return countProcessingMaterialsByUser.get(userId)?.count || 0;
    },
    /**
     * Return the total number of in-progress imports across all users
     * (used for the global capacity limit).
     * Queries: `materials`.
     * @returns {number}
     */
    countProcessingGlobal() {
      return countProcessingMaterialsGlobal.get()?.count || 0;
    },
    /**
     * Return a paginated, ordered slice of token rows for the reader view.
     * Each row includes the word's dictionary form, part-of-speech, reading,
     * pinyin, canonical translation, user's translation override, and status.
     * Translation preference: user override → native-language cache → source word.
     * Queries: `material_tokens` JOIN `words` LEFT JOIN `word_translations`
     * LEFT JOIN `user_words`.
     * @param {object} material - Material row with `id`, `languageName`.
     * @param {string} nativeLanguage
     * @param {number} safeLimit
     * @param {number} safeStart - Token position offset.
     * @param {number} userId
     * @returns {object[]}
     */
    listReaderTokens(material, nativeLanguage, safeLimit, safeStart, userId) {
      return readerTokens.all(nativeLanguage, material.languageName, nativeLanguage, material.languageName, nativeLanguage, userId, material.id, safeLimit, safeStart);
    }
  };
}

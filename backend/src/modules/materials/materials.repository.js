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
           w.translation AS "canonicalTranslation",
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
    createMaterial(userId, languageId, title, fileName, fileType, rawText, wordCount) {
      return createMaterial.run(userId, languageId, title, fileName, fileType, rawText, wordCount);
    },
    createProcessingMaterial(userId, languageId, title, fileName, fileType) {
      return createProcessingMaterial.run(userId, languageId, title, fileName, fileType);
    },
    updateImportMeta(materialId, rawText, wordCount, fileType, importTotal) {
      return updateMaterialImportMeta.run(rawText, wordCount, fileType, importTotal, materialId);
    },
    setImportProcessed(materialId, processed) {
      return updateMaterialImportProcessed.run(processed, materialId);
    },
    markImportReady(materialId) {
      return markMaterialImportReady.run(materialId);
    },
    markImportFailed(materialId, error) {
      return markMaterialImportFailed.run(error, materialId);
    },
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
    // Insert a batch of tokens in one multi-row statement. `entries` is an
    // array of { token, wordId } in position order.
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
    findById(materialId, userId) {
      return materialById.get(materialId, userId);
    },
    updateReaderStart(readerStart, materialId, userId) {
      return updateMaterialReaderStart.run(readerStart, materialId, userId);
    },
    updateTitle(title, materialId, userId) {
      return updateMaterialTitle.run(title, materialId, userId);
    },
    deleteById(materialId, userId) {
      return deleteMaterial.run(materialId, userId);
    },
    listByUserAndLanguage(userId, languageId, pageSize, offset, search = "") {
      const term = search.trim();
      if (!term) {
        return materialsByUserAndLanguage.all(userId, languageId, pageSize, offset);
      }
      const pattern = `%${term.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
      return materialsByUserLanguageSearch.all(userId, languageId, pattern, pageSize, offset);
    },
    listByUser(userId) {
      return materialsByUser.all(userId);
    },
    countByUser(userId) {
      return countMaterialsByUser.get(userId)?.count || 0;
    },
    countProcessingByUser(userId) {
      return countProcessingMaterialsByUser.get(userId)?.count || 0;
    },
    countProcessingGlobal() {
      return countProcessingMaterialsGlobal.get()?.count || 0;
    },
    listReaderTokens(material, nativeLanguage, safeLimit, safeStart, userId) {
      return readerTokens.all(nativeLanguage, material.languageName, nativeLanguage, material.languageName, nativeLanguage, userId, material.id, safeLimit, safeStart);
    }
  };
}

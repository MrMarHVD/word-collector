export function createTranslationsRepository(db) {
  const wordTranslation = db.prepare("SELECT translation FROM word_translations WHERE word_id = ? AND native_language = ?");
  const upsertWordTranslation = db.prepare(`
    INSERT INTO word_translations (word_id, native_language, translation, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(word_id, native_language) DO UPDATE SET translation = excluded.translation, updated_at = CURRENT_TIMESTAMP
  `);
  const materialTranslationTokens = db.prepare(`
    SELECT mt.word_id AS wordId, mt.surface, mt.lemma
    FROM material_tokens mt
    WHERE mt.material_id = ?
    ORDER BY mt.position
  `);
  const materialTranslationStatus = db.prepare(`
    SELECT COUNT(DISTINCT mt.word_id) AS totalWords,
           COUNT(DISTINCT wt.word_id) AS completedWords
    FROM material_tokens mt
    LEFT JOIN word_translations wt ON wt.word_id = mt.word_id AND wt.native_language = ?
    WHERE mt.material_id = ?
  `);

  return {
    findWordTranslation(wordId, nativeLanguage) {
      return wordTranslation.get(wordId, nativeLanguage);
    },
    upsertWordTranslation(wordId, nativeLanguage, translation) {
      return upsertWordTranslation.run(wordId, nativeLanguage, translation);
    },
    listMaterialTranslationTokens(materialId) {
      return materialTranslationTokens.all(materialId);
    },
    getMaterialTranslationStatus(targetLanguage, materialId) {
      return materialTranslationStatus.get(targetLanguage, materialId);
    }
  };
}

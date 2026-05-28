export function createDictionariesRepository(db) {
  const wikdictEnglishJapanese = db.prepare(`
    SELECT japanese, pos
    FROM wikdict_english_japanese
    WHERE english = ?
    ORDER BY rank, length(japanese)
    LIMIT 1
  `);
  const wikdictEnglishJapaneseTranslations = db.prepare(`
    SELECT japanese, pos
    FROM wikdict_english_japanese
    WHERE english = ?
    ORDER BY rank, length(japanese)
    LIMIT ?
  `);
  const japaneseEnglishByExpression = db.prepare(`
    SELECT gloss
    FROM jmdict_entries
    WHERE expression = ?
    ORDER BY priority DESC, length(gloss)
    LIMIT 1
  `);
  const japaneseEnglishByReading = db.prepare(`
    SELECT gloss
    FROM jmdict_entries
    WHERE reading = ?
    ORDER BY priority DESC, length(gloss)
    LIMIT 1
  `);
  const englishJapanese = db.prepare(`
    SELECT expression, pos
    FROM jmdict_english_index
    WHERE english = ?
    ORDER BY
      priority DESC,
      CASE
        WHEN lower(gloss) = ? THEN 0
        WHEN lower(gloss) LIKE ? THEN 1
        ELSE 2
      END,
      length(gloss),
      length(expression)
    LIMIT 1
  `);
  const englishChinese = db.prepare(`
    SELECT simplified, pos
    FROM cedict_english_index
    WHERE english = ?
    ORDER BY
      CASE
        WHEN lower(definitions) LIKE ? THEN 0
        WHEN lower(definitions) LIKE ? THEN 1
        WHEN lower(definitions) LIKE ? THEN 2
        WHEN lower(definitions) = ? THEN 3
        ELSE 4
      END,
      priority DESC,
      length(definitions),
      length(simplified)
    LIMIT 1
  `);
  const chineseEnglish = db.prepare(`
    SELECT definitions
    FROM cedict_english_index
    WHERE simplified = ? OR traditional = ?
    ORDER BY priority DESC, length(definitions), length(simplified)
    LIMIT 1
  `);
  const chineseDetails = db.prepare(`
    SELECT definitions, pinyin, traditional, simplified
    FROM cedict_english_index
    WHERE simplified = ? OR traditional = ?
    ORDER BY priority DESC, length(definitions), length(simplified)
    LIMIT 1
  `);
  const japaneseDetailsByExpression = db.prepare(`
    SELECT gloss, reading, expression
    FROM jmdict_entries
    WHERE expression = ?
    ORDER BY priority DESC, length(gloss)
    LIMIT 1
  `);
  const japaneseDetailsByReading = db.prepare(`
    SELECT gloss, reading
    FROM jmdict_entries
    WHERE reading = ?
    ORDER BY priority DESC, length(gloss)
    LIMIT 1
  `);

  return {
    findWikdictEnglishJapanese(term) {
      return wikdictEnglishJapanese.get(term);
    },
    listWikdictEnglishJapanese(term, limit = 5) {
      return wikdictEnglishJapaneseTranslations.all(term, Math.max(1, Math.min(Number(limit) || 5, 10)));
    },
    findJapaneseEnglishByExpression(term) {
      return japaneseEnglishByExpression.get(term);
    },
    findJapaneseEnglishByReading(term) {
      return japaneseEnglishByReading.get(term);
    },
    findEnglishJapanese(term) {
      return englishJapanese.get(term, term, `${term};%`);
    },
    findEnglishChinese(term) {
      return englishChinese.get(term, `${term};%cl:%`, `${term} (%cl:%`, `${term};%`, term);
    },
    findChineseEnglish(term) {
      return chineseEnglish.get(term, term);
    },
    findChineseDetails(term) {
      return chineseDetails.get(term, term);
    },
    findJapaneseDetailsByExpression(term) {
      return japaneseDetailsByExpression.get(term);
    },
    findJapaneseDetailsByReading(term) {
      return japaneseDetailsByReading.get(term);
    }
  };
}

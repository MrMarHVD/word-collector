export function createDictionariesRepository(db) {
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
    SELECT expression
    FROM jmdict_english_index
    WHERE english = ?
    ORDER BY priority DESC, length(gloss)
    LIMIT 1
  `);
  const englishChinese = db.prepare(`
    SELECT simplified
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
    findJapaneseEnglishByExpression(term) {
      return japaneseEnglishByExpression.get(term);
    },
    findJapaneseEnglishByReading(term) {
      return japaneseEnglishByReading.get(term);
    },
    findEnglishJapanese(term) {
      return englishJapanese.get(term);
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

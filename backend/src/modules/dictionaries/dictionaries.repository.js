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
  const wikdictEnglishChinese = db.prepare(`
    SELECT chinese, pos
    FROM wikdict_english_chinese
    WHERE english = ?
    ORDER BY rank, length(chinese)
    LIMIT 1
  `);
  const wikdictEnglishChineseTranslations = db.prepare(`
    SELECT chinese, pos
    FROM wikdict_english_chinese
    WHERE english = ?
    ORDER BY rank, length(chinese)
    LIMIT ?
  `);
  const wikdictSpanishEnglish = db.prepare(`
    SELECT english, pos
    FROM wikdict_spanish_english
    WHERE spanish = ?
    ORDER BY CASE WHEN coalesce(pos, '') = '' THEN 1 ELSE 0 END, rank, length(english)
    LIMIT 1
  `);
  const wikdictSpanishEnglishTranslations = db.prepare(`
    SELECT english, pos
    FROM wikdict_spanish_english
    WHERE spanish = ?
    ORDER BY CASE WHEN coalesce(pos, '') = '' THEN 1 ELSE 0 END, rank, length(english)
    LIMIT ?
  `);
  const wikdictSpanishEnglishViaAlias = db.prepare(`
    SELECT e.english, e.pos
    FROM wikdict_spanish_english_aliases a
    JOIN wikdict_spanish_english e ON e.spanish = a.headword
    WHERE a.spanish = ?
    ORDER BY CASE WHEN e.pos = 'verb' THEN 0 WHEN coalesce(e.pos, '') = '' THEN 2 ELSE 1 END, e.rank, length(e.english)
    LIMIT 1
  `);
  const wikdictSpanishEnglishTranslationsViaAlias = db.prepare(`
    SELECT e.english, e.pos, a.headword AS source
    FROM wikdict_spanish_english_aliases a
    JOIN wikdict_spanish_english e ON e.spanish = a.headword
    WHERE a.spanish = ?
    ORDER BY CASE WHEN e.pos = 'verb' THEN 0 WHEN coalesce(e.pos, '') = '' THEN 2 ELSE 1 END, e.rank, length(e.english)
    LIMIT ?
  `);
  const wikdictFrenchEnglish = db.prepare(`
    SELECT english, pos
    FROM wikdict_french_english
    WHERE french = ?
    ORDER BY rank, length(english)
    LIMIT 1
  `);
  const wikdictFrenchEnglishTranslations = db.prepare(`
    SELECT english, pos
    FROM wikdict_french_english
    WHERE french = ?
    ORDER BY rank, length(english)
    LIMIT ?
  `);
  const englishJapaneseTranslations = db.prepare(`
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
  const englishChineseTranslations = db.prepare(`
    SELECT simplified, traditional, pos
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
    LIMIT ?
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
      return wikdictEnglishJapaneseTranslations.all(term, Math.max(1, Math.min(Number(limit) || 5, 50)));
    },
    findWikdictEnglishChinese(term) {
      return wikdictEnglishChinese.get(term);
    },
    listWikdictEnglishChinese(term, limit = 5) {
      return wikdictEnglishChineseTranslations.all(term, Math.max(1, Math.min(Number(limit) || 5, 50)));
    },
    findWikdictSpanishEnglish(term) {
      return wikdictSpanishEnglish.get(term) || wikdictSpanishEnglishViaAlias.get(term);
    },
    listWikdictSpanishEnglish(term, limit = 5) {
      const safeLimit = Math.max(1, Math.min(Number(limit) || 5, 50));
      const direct = wikdictSpanishEnglishTranslations.all(term, safeLimit);
      if (direct.length) {
        return direct;
      }
      return wikdictSpanishEnglishTranslationsViaAlias.all(term, safeLimit);
    },
    findWikdictFrenchEnglish(term) {
      return wikdictFrenchEnglish.get(term);
    },
    listWikdictFrenchEnglish(term, limit = 5) {
      return wikdictFrenchEnglishTranslations.all(term, Math.max(1, Math.min(Number(limit) || 5, 50)));
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
    listEnglishJapanese(term, limit = 50) {
      return englishJapaneseTranslations.all(term, term, `${term};%`, Math.max(1, Math.min(Number(limit) || 50, 50)));
    },
    findEnglishChinese(term) {
      return englishChinese.get(term, `${term};%cl:%`, `${term} (%cl:%`, `${term};%`, term);
    },
    listEnglishChinese(term, limit = 50) {
      return englishChineseTranslations.all(term, `${term};%cl:%`, `${term} (%cl:%`, `${term};%`, term, Math.max(1, Math.min(Number(limit) || 50, 50)));
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

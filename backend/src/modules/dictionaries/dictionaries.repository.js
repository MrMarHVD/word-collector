/**
 * @fileoverview Dictionaries repository. Read-only lookups against static
 * dictionary tables populated by `scripts/`. Results are memoized for the
 * process lifetime in a bounded FIFO cache (max 50 000 entries) because the
 * data never changes at runtime. Tables: `wikdict_english_japanese`,
 * `wikdict_english_chinese`, `wikdict_spanish_english`,
 * `wikdict_spanish_english_aliases`, `wikdict_french_english`,
 * `wikdict_french_english_aliases`, `jmdict_english_index`, `jmdict_entries`,
 * `cedict_english_index`.
 */

// Dictionary tables are static reference data populated by scripts/, so
// lookups can be memoized for the life of the process. The cache is module
// level and therefore shared across repository instances, including the
// transaction-scoped ones rebuilt per import batch. Bounded FIFO eviction
// keeps memory in check; restart the server after re-seeding dictionaries.
const DICTIONARY_CACHE_MAX_ENTRIES = 50_000;
const dictionaryCache = new Map();

function withDictionaryCache(methods) {
  const wrapped = {};
  for (const [name, method] of Object.entries(methods)) {
    wrapped[name] = (...args) => {
      const key = `${name}\u0000${args.join("\u0000")}`;
      const hit = dictionaryCache.get(key);
      if (hit) {
        return hit;
      }
      const result = Promise.resolve(method(...args));
      dictionaryCache.set(key, result);
      if (dictionaryCache.size > DICTIONARY_CACHE_MAX_ENTRIES) {
        dictionaryCache.delete(dictionaryCache.keys().next().value);
      }
      // Never cache failures (e.g. transient connection errors).
      result.catch(() => dictionaryCache.delete(key));
      return result;
    };
  }
  return wrapped;
}

/**
 * Build the dictionaries repository. All returned methods are wrapped in the
 * process-level cache so repeated lookups for the same term are free.
 *
 * @param {object} db - Prepared-statement executor.
 * @returns {object} Repository with dictionary lookup methods.
 */
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
    ORDER BY CASE WHEN pos = 'verb' THEN 0 WHEN coalesce(pos, '') = '' THEN 2 ELSE 1 END, rank, length(english)
    LIMIT 1
  `);
  const wikdictFrenchEnglishTranslations = db.prepare(`
    SELECT english, pos
    FROM wikdict_french_english
    WHERE french = ?
    ORDER BY CASE WHEN pos = 'verb' THEN 0 WHEN coalesce(pos, '') = '' THEN 2 ELSE 1 END, rank, length(english)
    LIMIT ?
  `);
  const wikdictFrenchEnglishViaAlias = db.prepare(`
    SELECT e.english, e.pos
    FROM wikdict_french_english_aliases a
    JOIN wikdict_french_english e ON e.french = a.headword
    WHERE a.french = ?
    ORDER BY CASE WHEN e.pos = 'verb' THEN 0 WHEN coalesce(e.pos, '') = '' THEN 2 ELSE 1 END, e.rank, length(e.english)
    LIMIT 1
  `);
  const wikdictFrenchEnglishTranslationsViaAlias = db.prepare(`
    SELECT e.english, e.pos, a.headword AS source
    FROM wikdict_french_english_aliases a
    JOIN wikdict_french_english e ON e.french = a.headword
    WHERE a.french = ?
    ORDER BY CASE WHEN e.pos = 'verb' THEN 0 WHEN coalesce(e.pos, '') = '' THEN 2 ELSE 1 END, e.rank, length(e.english)
    LIMIT ?
  `);
  const englishJapaneseTranslations = db.prepare(`
    SELECT expression, pos, priority
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
    SELECT expression, pos, priority
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

  return withDictionaryCache({
    /**
     * Return the top WikDict English→Japanese result for `term`.
     * Queries: `wikdict_english_japanese`.
     * @param {string} term - English word.
     * @returns {object|undefined} Row with `japanese`, `pos`.
     */
    findWikdictEnglishJapanese(term) {
      return wikdictEnglishJapanese.get(term);
    },
    /**
     * Return up to `limit` WikDict English→Japanese results for `term`.
     * Queries: `wikdict_english_japanese`.
     * @param {string} term
     * @param {number} [limit=5] - Clamped to [1, 50].
     * @returns {object[]}
     */
    listWikdictEnglishJapanese(term, limit = 5) {
      return wikdictEnglishJapaneseTranslations.all(term, Math.max(1, Math.min(Number(limit) || 5, 50)));
    },
    /**
     * Return the top WikDict English→Chinese result for `term`.
     * Queries: `wikdict_english_chinese`.
     * @param {string} term
     * @returns {object|undefined} Row with `chinese`, `pos`.
     */
    findWikdictEnglishChinese(term) {
      return wikdictEnglishChinese.get(term);
    },
    /**
     * Return up to `limit` WikDict English→Chinese results for `term`.
     * Queries: `wikdict_english_chinese`.
     * @param {string} term
     * @param {number} [limit=5]
     * @returns {object[]}
     */
    listWikdictEnglishChinese(term, limit = 5) {
      return wikdictEnglishChineseTranslations.all(term, Math.max(1, Math.min(Number(limit) || 5, 50)));
    },
    /**
     * Return the top WikDict Spanish→English result for `term`. Falls back to
     * the alias table when no direct match exists.
     * Queries: `wikdict_spanish_english`, `wikdict_spanish_english_aliases`.
     * @param {string} term
     * @returns {Promise<object|undefined>}
     */
    async findWikdictSpanishEnglish(term) {
      return (await wikdictSpanishEnglish.get(term)) || (await wikdictSpanishEnglishViaAlias.get(term));
    },
    /**
     * Return up to `limit` WikDict Spanish→English results. Falls back to the
     * alias table when the direct table returns no rows.
     * Queries: `wikdict_spanish_english`, `wikdict_spanish_english_aliases`.
     * @param {string} term
     * @param {number} [limit=5]
     * @returns {Promise<object[]>}
     */
    async listWikdictSpanishEnglish(term, limit = 5) {
      const safeLimit = Math.max(1, Math.min(Number(limit) || 5, 50));
      const direct = await wikdictSpanishEnglishTranslations.all(term, safeLimit);
      if (direct.length) {
        return direct;
      }
      return wikdictSpanishEnglishTranslationsViaAlias.all(term, safeLimit);
    },
    /**
     * Return the top WikDict French→English result for `term`. Falls back to
     * the alias table when no direct match exists.
     * Queries: `wikdict_french_english`, `wikdict_french_english_aliases`.
     * @param {string} term
     * @returns {Promise<object|undefined>}
     */
    async findWikdictFrenchEnglish(term) {
      return (await wikdictFrenchEnglish.get(term)) || (await wikdictFrenchEnglishViaAlias.get(term));
    },
    /**
     * Return up to `limit` WikDict French→English results. Falls back to the
     * alias table when the direct table returns no rows.
     * Queries: `wikdict_french_english`, `wikdict_french_english_aliases`.
     * @param {string} term
     * @param {number} [limit=5]
     * @returns {Promise<object[]>}
     */
    async listWikdictFrenchEnglish(term, limit = 5) {
      const safeLimit = Math.max(1, Math.min(Number(limit) || 5, 50));
      const direct = await wikdictFrenchEnglishTranslations.all(term, safeLimit);
      if (direct.length) {
        return direct;
      }
      return wikdictFrenchEnglishTranslationsViaAlias.all(term, safeLimit);
    },
    /**
     * Look up a JMdict English gloss for a Japanese expression (kanji/kana form).
     * Queries: `jmdict_entries`.
     * @param {string} term
     * @returns {object|undefined} Row with `gloss`.
     */
    findJapaneseEnglishByExpression(term) {
      return japaneseEnglishByExpression.get(term);
    },
    /**
     * Look up a JMdict English gloss for a Japanese reading (hiragana/katakana).
     * Queries: `jmdict_entries`.
     * @param {string} term
     * @returns {object|undefined} Row with `gloss`.
     */
    findJapaneseEnglishByReading(term) {
      return japaneseEnglishByReading.get(term);
    },
    /**
     * Return the best-ranked JMdict Japanese expression for an English term.
     * Queries: `jmdict_english_index`.
     * @param {string} term
     * @returns {object|undefined} Row with `expression`, `pos`, `priority`.
     */
    findEnglishJapanese(term) {
      return englishJapanese.get(term, term, `${term};%`);
    },
    /**
     * Return up to `limit` ranked JMdict Japanese expressions for an English term.
     * Queries: `jmdict_english_index`.
     * @param {string} term
     * @param {number} [limit=50]
     * @returns {object[]}
     */
    listEnglishJapanese(term, limit = 50) {
      return englishJapaneseTranslations.all(term, term, `${term};%`, Math.max(1, Math.min(Number(limit) || 50, 50)));
    },
    /**
     * Return the best-ranked CEDICT Chinese simplified form for an English term.
     * Classifier and parenthetical metadata in definitions influence ranking.
     * Queries: `cedict_english_index`.
     * @param {string} term
     * @returns {object|undefined} Row with `simplified`, `pos`.
     */
    findEnglishChinese(term) {
      return englishChinese.get(term, `${term};%cl:%`, `${term} (%cl:%`, `${term};%`, term);
    },
    /**
     * Return up to `limit` ranked CEDICT Chinese entries for an English term.
     * Queries: `cedict_english_index`.
     * @param {string} term
     * @param {number} [limit=50]
     * @returns {object[]}
     */
    listEnglishChinese(term, limit = 50) {
      return englishChineseTranslations.all(term, `${term};%cl:%`, `${term} (%cl:%`, `${term};%`, term, Math.max(1, Math.min(Number(limit) || 50, 50)));
    },
    /**
     * Return the best-ranked CEDICT English gloss for a Chinese term (simplified or traditional).
     * Queries: `cedict_english_index`.
     * @param {string} term
     * @returns {object|undefined} Row with `definitions`.
     */
    findChineseEnglish(term) {
      return chineseEnglish.get(term, term);
    },
    /**
     * Return CEDICT metadata (definitions, pinyin, traditional, simplified) for a Chinese term.
     * Queries: `cedict_english_index`.
     * @param {string} term
     * @returns {object|undefined}
     */
    findChineseDetails(term) {
      return chineseDetails.get(term, term);
    },
    /**
     * Return JMdict metadata (gloss, reading, expression) for a Japanese expression.
     * Queries: `jmdict_entries`.
     * @param {string} term
     * @returns {object|undefined}
     */
    findJapaneseDetailsByExpression(term) {
      return japaneseDetailsByExpression.get(term);
    },
    /**
     * Return JMdict metadata (gloss, reading) for a Japanese reading form.
     * Queries: `jmdict_entries`.
     * @param {string} term
     * @returns {object|undefined}
     */
    findJapaneseDetailsByReading(term) {
      return japaneseDetailsByReading.get(term);
    }
  });
}

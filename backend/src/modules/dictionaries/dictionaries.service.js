/**
 * @fileoverview Dictionaries service. Language-pair translation lookups that
 * combine JMdict, CEDICT, and WikDict indexes. Provides both single-result
 * "find" helpers and multi-result "entries" helpers used to populate
 * disambiguation candidates. Also contains Pinyin tone-mark conversion and
 * Chinese/Japanese metadata lookups. Pivot lookups (Japanese→Chinese,
 * Chinese→Japanese) route through English as an intermediary.
 */

import { normalizeName } from "../../shared/normalize.js";

/**
 * Look up the best English gloss for a Japanese expression or reading.
 * Tries expression match first, then reading match.
 * @param {object} dictionariesRepository
 * @param {string} term
 * @returns {Promise<string>} English gloss, or empty string when not found.
 */
export async function lookupJapaneseEnglish(dictionariesRepository, term) {
  const clean = normalizeName(term);
  if (!clean) {
    return "";
  }

  const exact = await dictionariesRepository.findJapaneseEnglishByExpression(clean);
  if (exact?.gloss) {
    return exact.gloss;
  }

  const reading = await dictionariesRepository.findJapaneseEnglishByReading(clean);
  return reading?.gloss || "";
}

/**
 * Return the top-ranked Japanese expression for an English term.
 * @param {object} dictionariesRepository
 * @param {string} term
 * @returns {Promise<string>} Japanese expression, or empty string.
 */
export async function lookupEnglishJapanese(dictionariesRepository, term) {
  return (await lookupEnglishJapaneseEntries(dictionariesRepository, term, 1))[0]?.translation || "";
}

/**
 * Return up to `limit` deduped English→Japanese entries from WikDict.
 * @param {object} dictionariesRepository
 * @param {string} term
 * @param {number} [limit=50]
 * @returns {Promise<Array<{ source: string, translation: string, pos: string }>>}
 */
export async function lookupEnglishJapaneseEntries(dictionariesRepository, term, limit = 50) {
  const clean = normalizeName(term).toLowerCase();
  if (!clean) {
    return [];
  }

  const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 50));
  const wikdict = (await dictionariesRepository.listWikdictEnglishJapanese(clean, safeLimit)).map((entry) => ({
    source: clean,
    translation: entry.japanese,
    pos: entry.pos || ""
  }));
  return dedupeDictionaryEntries(wikdict).slice(0, safeLimit);
}

/**
 * Return the distinct parts-of-speech found in the English→Japanese entry list.
 * @param {object} dictionariesRepository
 * @param {string} term
 * @returns {Promise<string[]>}
 */
export async function lookupEnglishJapaneseCategories(dictionariesRepository, term) {
  return [...new Set((await lookupEnglishJapaneseEntries(dictionariesRepository, term, 50)).map((entry) => entry.pos).filter(Boolean))];
}

function dedupeDictionaryEntries(entries) {
  const seen = new Set();
  const result = [];
  for (const entry of entries) {
    const translation = normalizeName(entry.translation);
    if (!translation) continue;
    const pos = normalizeName(entry.pos);
    const key = `${translation.toLowerCase()}\u0000${pos.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ ...entry, translation, pos });
  }
  return result;
}

/**
 * Return the top-ranked simplified Chinese expression for an English term.
 * @param {object} dictionariesRepository
 * @param {string} term
 * @returns {Promise<string>}
 */
export async function lookupEnglishChinese(dictionariesRepository, term) {
  return (await lookupEnglishChineseEntries(dictionariesRepository, term, 1))[0]?.translation || "";
}

/**
 * Return up to `limit` deduped English→Chinese entries, preferring WikDict
 * over CEDICT when both have results.
 * @param {object} dictionariesRepository
 * @param {string} term
 * @param {number} [limit=50]
 * @returns {Promise<Array<{ source: string, translation: string, pos: string }>>}
 */
export async function lookupEnglishChineseEntries(dictionariesRepository, term, limit = 50) {
  const clean = normalizeName(term).toLowerCase();
  if (!clean) {
    return [];
  }

  const wikdict = await dictionariesRepository.listWikdictEnglishChinese(clean, limit);
  if (wikdict.length) {
    return dedupeDictionaryEntries(wikdict.map((entry) => ({
      source: clean,
      translation: entry.chinese,
      pos: entry.pos || ""
    })));
  }
  return dedupeDictionaryEntries((await dictionariesRepository.listEnglishChinese(clean, limit)).map((entry) => ({
    source: clean,
    translation: entry.simplified,
    pos: entry.pos || ""
  })));
}

/**
 * Return the top-ranked English translation for a Spanish term.
 * @param {object} dictionariesRepository
 * @param {string} term
 * @returns {Promise<string>}
 */
export async function lookupSpanishEnglish(dictionariesRepository, term) {
  return (await lookupSpanishEnglishEntries(dictionariesRepository, term, 1))[0]?.translation || "";
}

/**
 * Return up to `limit` deduped Spanish→English entries from WikDict.
 * @param {object} dictionariesRepository
 * @param {string} term
 * @param {number} [limit=50]
 * @returns {Promise<Array<{ source: string, translation: string, pos: string }>>}
 */
export async function lookupSpanishEnglishEntries(dictionariesRepository, term, limit = 50) {
  const clean = normalizeName(term).toLowerCase();
  if (!clean) {
    return [];
  }
  return dedupeDictionaryEntries((await dictionariesRepository.listWikdictSpanishEnglish(clean, limit)).map((entry) => ({
    source: entry.source || clean,
    translation: entry.english,
    pos: entry.pos || ""
  })));
}

/**
 * Return the top-ranked English translation for a French term.
 * @param {object} dictionariesRepository
 * @param {string} term
 * @returns {Promise<string>}
 */
export async function lookupFrenchEnglish(dictionariesRepository, term) {
  return (await lookupFrenchEnglishEntries(dictionariesRepository, term, 1))[0]?.translation || "";
}

/**
 * Return up to `limit` deduped French→English entries from WikDict.
 * @param {object} dictionariesRepository
 * @param {string} term
 * @param {number} [limit=50]
 * @returns {Promise<Array<{ source: string, translation: string, pos: string }>>}
 */
export async function lookupFrenchEnglishEntries(dictionariesRepository, term, limit = 50) {
  const clean = normalizeName(term).toLowerCase();
  if (!clean) {
    return [];
  }
  return dedupeDictionaryEntries((await dictionariesRepository.listWikdictFrenchEnglish(clean, limit)).map((entry) => ({
    source: entry.source || clean,
    translation: entry.english,
    pos: entry.pos || ""
  })));
}

/**
 * Return a part-of-speech tag for an English term by querying WikDict's
 * English→Japanese and English→Chinese indexes. Returns the first non-empty
 * `pos` found across the three dictionary sources.
 * @param {object} dictionariesRepository
 * @param {string} term
 * @returns {Promise<string>}
 */
export async function lookupEnglishPos(dictionariesRepository, term) {
  const clean = normalizeName(term).toLowerCase();
  if (!clean) {
    return "";
  }
  return (await dictionariesRepository.findWikdictEnglishJapanese(clean))?.pos
    || (await dictionariesRepository.findWikdictEnglishChinese(clean))?.pos
    || (await dictionariesRepository.findEnglishChinese(clean))?.pos
    || "";
}

// Remove classifier and parenthetical metadata before showing CEDICT glosses.
function cleanCedictDefinition(definitions) {
  const cleaned = String(definitions || "")
    .split(";")
    .map((definition) =>
      definition
        .replace(/\bCL:[^;]+/gi, "")
        .replace(/\([^)]*\)/g, "")
        .trim()
    )
    .filter(Boolean);
  return normalizeName(cleaned.join("; "));
}

const PINYIN_TONE_MARKS = {
  a: ["a", "ā", "á", "ǎ", "à", "a"],
  e: ["e", "ē", "é", "ě", "è", "e"],
  i: ["i", "ī", "í", "ǐ", "ì", "i"],
  o: ["o", "ō", "ó", "ǒ", "ò", "o"],
  u: ["u", "ū", "ú", "ǔ", "ù", "u"],
  "u:": ["ü", "ǖ", "ǘ", "ǚ", "ǜ", "ü"]
};

// Place the tone mark on the syllable's main vowel following Hanyu Pinyin rules.
function applyPinyinToneToSyllable(syllable, tone) {
  if (tone === 0 || tone === 5) {
    return syllable.replace(/u:/g, "ü");
  }
  const lower = syllable.toLowerCase();
  let vowelIndex = -1;
  let vowelKey = "";
  const priorities = ["a", "e", "o"];
  for (const target of priorities) {
    const index = lower.indexOf(target);
    if (index !== -1) {
      vowelIndex = index;
      vowelKey = target;
      break;
    }
  }
  if (vowelIndex === -1) {
    const iuMatch = lower.match(/iu|ui|u:|[aeiouü]/);
    if (!iuMatch) {
      return syllable.replace(/u:/g, "ü");
    }
    const match = iuMatch[0];
    if (match === "iu") {
      vowelIndex = lower.indexOf("iu") + 1;
      vowelKey = "u";
    } else if (match === "ui") {
      vowelIndex = lower.indexOf("ui") + 1;
      vowelKey = "i";
    } else if (match === "u:") {
      vowelIndex = lower.indexOf("u:");
      vowelKey = "u:";
    } else {
      vowelIndex = lower.indexOf(match);
      vowelKey = match;
    }
  }
  const replacement = PINYIN_TONE_MARKS[vowelKey]?.[tone] || syllable.charAt(vowelIndex);
  const keyLength = vowelKey.length;
  const head = syllable.slice(0, vowelIndex).replace(/u:/g, "ü");
  const tail = syllable.slice(vowelIndex + keyLength).replace(/u:/g, "ü");
  return head + replacement + tail;
}

/**
 * Convert CEDICT numeric pinyin (e.g. `"Zhong1 guo2"`) to Unicode tone-mark
 * form (`"Zhōngguó"`). Tone numbers 1–4 apply the appropriate diacritic;
 * 0 or 5 produces a neutral/tone-less syllable.
 * @param {string} pinyin
 * @returns {string}
 */
export function pinyinToToneMarks(pinyin) {
  if (!pinyin) return "";
  const parts = String(pinyin).split(/\s+/).filter(Boolean);
  const syllables = parts.map((part) => {
    const match = part.match(/^([A-Za-z:]+)([0-5])?$/);
    if (!match) {
      return part;
    }
    const tone = Number(match[2] || 0);
    return applyPinyinToneToSyllable(match[1], tone);
  });
  return syllables.join("");
}

/**
 * Return a cleaned English gloss for a Chinese simplified or traditional form.
 * Classifier (`CL:…`) and parenthetical metadata are stripped from CEDICT definitions.
 * @param {object} dictionariesRepository
 * @param {string} term
 * @returns {Promise<string>}
 */
export async function lookupChineseEnglish(dictionariesRepository, term) {
  const clean = normalizeName(term);
  if (!clean) {
    return "";
  }

  const exact = await dictionariesRepository.findChineseEnglish(clean);
  return cleanCedictDefinition(exact?.definitions);
}

// Extract searchable normalized keys from a semicolon-delimited translation.
function translationKeys(value) {
  return translationKeyCandidates(value).slice(0, 1);
}

function translationKeyCandidates(value) {
  const candidates = normalizeName(value)
    .split(/[;,]/)
    .map((part) => part
    .replace(/\([^)]*\)/g, "")
    .trim()
    .toLowerCase())
    .filter(Boolean);
  const keys = [];
  for (const candidate of candidates) {
    keys.push(candidate);
    if (candidate.startsWith("to ")) {
      keys.push(candidate.slice(3).trim());
    }
  }
  return [...new Set(keys)].filter(Boolean);
}

async function entriesForEnglishKey(lookupEntries, dictionariesRepository, key, limit) {
  const clean = key.startsWith("to ") ? key.slice(3).trim() : key;
  const entries = await lookupEntries(dictionariesRepository, clean, limit);
  if (!key.startsWith("to ")) {
    return entries;
  }
  return [
    ...entries.filter((entry) => entry.pos === "verb"),
    ...entries.filter((entry) => entry.pos !== "verb")
  ];
}

/**
 * Return Chinese metadata (cleaned English gloss, tone-marked pinyin, traditional
 * form) for a simplified or traditional Chinese term. `traditional` is empty
 * when identical to the simplified form.
 * @param {object} dictionariesRepository
 * @param {string} term
 * @returns {Promise<{ translation: string, pinyin: string, traditional: string }>}
 */
export async function lookupChineseDetails(dictionariesRepository, term) {
  const clean = normalizeName(term);
  if (!clean) {
    return { translation: "", pinyin: "", traditional: "" };
  }
  const row = await dictionariesRepository.findChineseDetails(clean);
  if (!row) {
    return { translation: "", pinyin: "", traditional: "" };
  }
  return {
    translation: cleanCedictDefinition(row.definitions),
    pinyin: pinyinToToneMarks(row.pinyin),
    traditional: row.traditional === row.simplified ? "" : row.traditional
  };
}

/**
 * Return Japanese metadata (English gloss, hiragana reading) for an expression
 * or reading form. Falls back from expression match to reading match.
 * @param {object} dictionariesRepository
 * @param {string} term
 * @returns {Promise<{ translation: string, reading: string }>}
 */
export async function lookupJapaneseDetails(dictionariesRepository, term) {
  const clean = normalizeName(term);
  if (!clean) {
    return { translation: "", reading: "" };
  }
  const exact = await dictionariesRepository.findJapaneseDetailsByExpression(clean);
  if (exact?.gloss) {
    return { translation: exact.gloss, reading: exact.reading || "" };
  }
  const byReading = await dictionariesRepository.findJapaneseDetailsByReading(clean);
  if (byReading?.gloss) {
    return { translation: byReading.gloss, reading: byReading.reading || clean };
  }
  return { translation: "", reading: "" };
}

/**
 * Return the top-ranked Chinese translation for a Japanese term, routed through
 * the English dictionary index.
 * @param {object} dictionariesRepository
 * @param {string} term
 * @returns {Promise<string>}
 */
export async function lookupJapaneseChinese(dictionariesRepository, term) {
  return (await lookupJapaneseChineseEntries(dictionariesRepository, term, 1))[0]?.translation || "";
}

/**
 * Return up to `limit` deduped Japanese→Chinese entries routed through
 * the English index. Each English gloss candidate from the Japanese lookup
 * is used as a key into the English→Chinese lookup.
 * @param {object} dictionariesRepository
 * @param {string} term
 * @param {number} [limit=50]
 * @returns {Promise<Array<{ source: string, translation: string, pos: string }>>}
 */
export async function lookupJapaneseChineseEntries(dictionariesRepository, term, limit = 50) {
  const clean = normalizeName(term);
  const english = await lookupJapaneseEnglish(dictionariesRepository, clean);
  const entries = [];
  for (const key of translationKeyCandidates(english)) {
    for (const entry of await entriesForEnglishKey(lookupEnglishChineseEntries, dictionariesRepository, key, limit)) {
      entries.push({ ...entry, source: clean || key });
      if (entries.length >= limit) return dedupeDictionaryEntries(entries);
    }
  }
  return dedupeDictionaryEntries(entries);
}

/**
 * Return the top-ranked Japanese translation for a Chinese term, routed through
 * the English dictionary index.
 * @param {object} dictionariesRepository
 * @param {string} term
 * @returns {Promise<string>}
 */
export async function lookupChineseJapanese(dictionariesRepository, term) {
  return (await lookupChineseJapaneseEntries(dictionariesRepository, term, 1))[0]?.translation || "";
}

/**
 * Return up to `limit` deduped Chinese→Japanese entries routed through the
 * English index.
 * @param {object} dictionariesRepository
 * @param {string} term
 * @param {number} [limit=50]
 * @returns {Promise<Array<{ source: string, translation: string, pos: string }>>}
 */
export async function lookupChineseJapaneseEntries(dictionariesRepository, term, limit = 50) {
  const clean = normalizeName(term);
  const english = await lookupChineseEnglish(dictionariesRepository, clean);
  const entries = [];
  for (const key of translationKeyCandidates(english)) {
    for (const entry of await entriesForEnglishKey(lookupEnglishJapaneseEntries, dictionariesRepository, key, limit)) {
      entries.push({ ...entry, source: clean || key });
      if (entries.length >= limit) return dedupeDictionaryEntries(entries);
    }
  }
  return dedupeDictionaryEntries(entries);
}

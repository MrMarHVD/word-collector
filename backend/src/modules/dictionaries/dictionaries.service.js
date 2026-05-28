import { normalizeName } from "../../shared/normalize.js";

// Dictionary lookups use local JMdict and CEDICT indexes populated by scripts/.
// Look up an English gloss for a Japanese expression or reading.
export function lookupJapaneseEnglish(dictionariesRepository, term) {
  const clean = normalizeName(term);
  if (!clean) {
    return "";
  }

  const exact = dictionariesRepository.findJapaneseEnglishByExpression(clean);
  if (exact?.gloss) {
    return exact.gloss;
  }

  const reading = dictionariesRepository.findJapaneseEnglishByReading(clean);
  return reading?.gloss || "";
}

// Look up a Japanese expression from an English dictionary key.
export function lookupEnglishJapanese(dictionariesRepository, term) {
  return lookupEnglishJapaneseEntries(dictionariesRepository, term, 1)[0]?.translation || "";
}

export function lookupEnglishJapaneseEntries(dictionariesRepository, term, limit = 50) {
  const clean = normalizeName(term).toLowerCase();
  if (!clean) {
    return [];
  }

  const wikdict = dictionariesRepository.listWikdictEnglishJapanese(clean, limit);
  if (wikdict.length) {
    return dedupeDictionaryEntries(wikdict.map((entry) => ({
      source: clean,
      translation: entry.japanese,
      pos: entry.pos || ""
    })));
  }
  return dedupeDictionaryEntries(dictionariesRepository.listEnglishJapanese(clean, limit).map((entry) => ({
    source: clean,
    translation: entry.expression,
    pos: entry.pos || ""
  })));
}

export function lookupEnglishJapaneseCategories(dictionariesRepository, term) {
  return [...new Set(lookupEnglishJapaneseEntries(dictionariesRepository, term, 50).map((entry) => entry.pos).filter(Boolean))];
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

// Look up a simplified Chinese expression from an English dictionary key.
export function lookupEnglishChinese(dictionariesRepository, term) {
  const clean = normalizeName(term).toLowerCase();
  if (!clean) {
    return "";
  }

  const exact = dictionariesRepository.findEnglishChinese(clean);
  return exact?.simplified || "";
}

export function lookupEnglishPos(dictionariesRepository, term) {
  const clean = normalizeName(term).toLowerCase();
  if (!clean) {
    return "";
  }
  return dictionariesRepository.findWikdictEnglishJapanese(clean)?.pos
    || dictionariesRepository.findEnglishJapanese(clean)?.pos
    || dictionariesRepository.findEnglishChinese(clean)?.pos
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

// Convert CEDICT numeric pinyin (e.g. "Zhong1 guo2") to tone-mark form ("Zhōngguó").
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

// Look up an English gloss for a Chinese simplified or traditional form.
export function lookupChineseEnglish(dictionariesRepository, term) {
  const clean = normalizeName(term);
  if (!clean) {
    return "";
  }

  const exact = dictionariesRepository.findChineseEnglish(clean);
  return cleanCedictDefinition(exact?.definitions);
}

// Extract searchable normalized keys from a semicolon-delimited translation.
function translationKeys(value) {
  const clean = normalizeName(value)
    .split(";")[0]
    .split(",")[0]
    .replace(/\([^)]*\)/g, "")
    .trim()
    .toLowerCase();
  if (!clean) {
    return [];
  }
  const keys = [clean];
  if (clean.startsWith("to ")) {
    keys.push(clean.slice(3).trim());
  }
  return keys.filter(Boolean);
}

// Look up Chinese metadata (translation, pinyin, traditional) for a term.
export function lookupChineseDetails(dictionariesRepository, term) {
  const clean = normalizeName(term);
  if (!clean) {
    return { translation: "", pinyin: "", traditional: "" };
  }
  const row = dictionariesRepository.findChineseDetails(clean);
  if (!row) {
    return { translation: "", pinyin: "", traditional: "" };
  }
  return {
    translation: cleanCedictDefinition(row.definitions),
    pinyin: pinyinToToneMarks(row.pinyin),
    traditional: row.traditional === row.simplified ? "" : row.traditional
  };
}

// Look up Japanese metadata (translation, reading) for an expression or reading.
export function lookupJapaneseDetails(dictionariesRepository, term) {
  const clean = normalizeName(term);
  if (!clean) {
    return { translation: "", reading: "" };
  }
  const exact = dictionariesRepository.findJapaneseDetailsByExpression(clean);
  if (exact?.gloss) {
    return { translation: exact.gloss, reading: exact.reading || "" };
  }
  const byReading = dictionariesRepository.findJapaneseDetailsByReading(clean);
  if (byReading?.gloss) {
    return { translation: byReading.gloss, reading: byReading.reading || clean };
  }
  return { translation: "", reading: "" };
}

// Translate a Japanese term to Chinese through the English dictionary index.
export function lookupJapaneseChinese(dictionariesRepository, term) {
  const english = lookupJapaneseEnglish(dictionariesRepository, term);
  for (const key of translationKeys(english)) {
    const chinese = lookupEnglishChinese(dictionariesRepository, key);
    if (chinese) {
      return chinese;
    }
  }
  return "";
}

// Translate a Chinese term to Japanese through the English dictionary index.
export function lookupChineseJapanese(dictionariesRepository, term) {
  const english = lookupChineseEnglish(dictionariesRepository, term);
  for (const key of translationKeys(english)) {
    const japanese = lookupEnglishJapanese(dictionariesRepository, key);
    if (japanese) {
      return japanese;
    }
  }
  return "";
}

import { normalizeName } from "../shared/normalize.js";

// Dictionary lookups use local JMdict and CEDICT indexes populated by scripts/.
// Look up an English gloss for a Japanese expression or reading.
export function lookupJapaneseEnglish(db, term) {
  const clean = normalizeName(term);
  if (!clean) {
    return "";
  }

  const exact = db.prepare(`
    SELECT gloss
    FROM jmdict_entries
    WHERE expression = ?
    ORDER BY priority DESC, length(gloss)
    LIMIT 1
  `).get(clean);
  if (exact?.gloss) {
    return exact.gloss;
  }

  const reading = db.prepare(`
    SELECT gloss
    FROM jmdict_entries
    WHERE reading = ?
    ORDER BY priority DESC, length(gloss)
    LIMIT 1
  `).get(clean);
  return reading?.gloss || "";
}

// Look up a Japanese expression from an English dictionary key.
export function lookupEnglishJapanese(db, term) {
  const clean = normalizeName(term).toLowerCase();
  if (!clean) {
    return "";
  }

  const exact = db.prepare(`
    SELECT expression
    FROM jmdict_english_index
    WHERE english = ?
    ORDER BY priority DESC, length(gloss)
    LIMIT 1
  `).get(clean);
  return exact?.expression || "";
}

// Look up a simplified Chinese expression from an English dictionary key.
export function lookupEnglishChinese(db, term) {
  const clean = normalizeName(term).toLowerCase();
  if (!clean) {
    return "";
  }

  const exact = db.prepare(`
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
  `).get(clean, `${clean};%cl:%`, `${clean} (%cl:%`, `${clean};%`, clean);
  return exact?.simplified || "";
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
export function lookupChineseEnglish(db, term) {
  const clean = normalizeName(term);
  if (!clean) {
    return "";
  }

  const exact = db.prepare(`
    SELECT definitions
    FROM cedict_english_index
    WHERE simplified = ? OR traditional = ?
    ORDER BY priority DESC, length(definitions), length(simplified)
    LIMIT 1
  `).get(clean, clean);
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
export function lookupChineseDetails(db, term) {
  const clean = normalizeName(term);
  if (!clean) {
    return { translation: "", pinyin: "", traditional: "" };
  }
  const row = db.prepare(`
    SELECT definitions, pinyin, traditional, simplified
    FROM cedict_english_index
    WHERE simplified = ? OR traditional = ?
    ORDER BY priority DESC, length(definitions), length(simplified)
    LIMIT 1
  `).get(clean, clean);
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
export function lookupJapaneseDetails(db, term) {
  const clean = normalizeName(term);
  if (!clean) {
    return { translation: "", reading: "" };
  }
  const exact = db.prepare(`
    SELECT gloss, reading, expression
    FROM jmdict_entries
    WHERE expression = ?
    ORDER BY priority DESC, length(gloss)
    LIMIT 1
  `).get(clean);
  if (exact?.gloss) {
    return { translation: exact.gloss, reading: exact.reading || "" };
  }
  const byReading = db.prepare(`
    SELECT gloss, reading
    FROM jmdict_entries
    WHERE reading = ?
    ORDER BY priority DESC, length(gloss)
    LIMIT 1
  `).get(clean);
  if (byReading?.gloss) {
    return { translation: byReading.gloss, reading: byReading.reading || clean };
  }
  return { translation: "", reading: "" };
}

// Translate a Japanese term to Chinese through the English dictionary index.
export function lookupJapaneseChinese(db, term) {
  const english = lookupJapaneseEnglish(db, term);
  for (const key of translationKeys(english)) {
    const chinese = lookupEnglishChinese(db, key);
    if (chinese) {
      return chinese;
    }
  }
  return "";
}

// Translate a Chinese term to Japanese through the English dictionary index.
export function lookupChineseJapanese(db, term) {
  const english = lookupChineseEnglish(db, term);
  for (const key of translationKeys(english)) {
    const japanese = lookupEnglishJapanese(db, key);
    if (japanese) {
      return japanese;
    }
  }
  return "";
}

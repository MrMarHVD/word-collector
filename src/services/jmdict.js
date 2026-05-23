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
  return normalizeName(
    String(definitions || "")
      .split(";")
      .map((definition) =>
        definition
          .replace(/\bCL:[^;]+/gi, "")
          .replace(/\([^)]*\)/g, "")
          .trim()
      )
      .find(Boolean) || ""
  );
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

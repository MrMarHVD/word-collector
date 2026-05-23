import { normalizeName } from "../shared/normalize.js";

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

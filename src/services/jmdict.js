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

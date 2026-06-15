/**
 * @file import_wikdict_en_zh.js
 * @description Imports the WikDict English→Chinese dictionary from a StarDict zip
 * archive into the `wikdict_english_chinese` table. The entire table is cleared and
 * rebuilt within a single transaction so the data is always consistent.
 *
 * Source format: StarDict zip containing `stardict.idx` (binary index) and
 * `stardict.dict` (HTML entry data). Expected default location:
 * `<ROOT>/data/dictionaries/wikdict-en-zh.zip`.
 *
 * Database side effects:
 *  - Truncates `wikdict_english_chinese` and replaces all rows.
 *  - Each row: (english, chinese, pos, rank, definition). `rank` reflects the
 *    ordinal position of the translation within the entry (lower = more prominent).
 *
 * CLI usage:
 * ```
 * node backend/scripts/import_wikdict_en_zh.js [zipPath]
 * ```
 * Optional first argument overrides the default zip path.
 *
 * Exits with a JSON summary `{ entries, rows }` printed to stdout.
 * Requires `DATABASE_URL` (or equivalent db config) to be set in the environment.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import JSZip from "jszip";
import { db, pool } from "../src/db/index.js";
import { ROOT } from "../src/config.js";

const sourcePath = process.argv[2] || join(ROOT, "data", "dictionaries", "wikdict-en-zh.zip");

/**
 * Decode HTML entities in a StarDict entry field.
 *
 * @param {unknown} value - Raw value from the dictionary entry.
 * @returns {string} Value with common HTML entities replaced by their characters.
 */
function decodeHtml(value) {
  return String(value || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/**
 * Strip all HTML tags from a value and normalise whitespace.
 *
 * @param {unknown} value - Raw HTML string.
 * @returns {string} Plain text with collapsed whitespace.
 */
function stripTags(value) {
  return decodeHtml(String(value || "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

/**
 * Map a grammar label string to a canonical POS tag.
 *
 * @param {unknown} value - Grammar label text from the dictionary entry.
 * @returns {"noun"|"verb"|"adjective"|"adverb"|""} Canonical POS string, or empty
 *   string if the label does not match a known category.
 */
function posForLabel(value) {
  const clean = String(value || "").toLowerCase();
  if (clean.includes("noun")) return "noun";
  if (clean.includes("verb")) return "verb";
  if (clean.includes("adjective")) return "adjective";
  if (clean.includes("adverb")) return "adverb";
  return "";
}

/**
 * Parse a StarDict `.idx` binary buffer into an array of entry descriptors.
 *
 * @param {Buffer} idxBuffer - Contents of a StarDict `.idx` file.
 * @returns {{ word: string, dataOffset: number, size: number }[]} Parsed entries.
 */
function readIdxEntries(idxBuffer) {
  const entries = [];
  let offset = 0;
  while (offset < idxBuffer.length) {
    const end = idxBuffer.indexOf(0, offset);
    if (end === -1 || end + 9 > idxBuffer.length) break;
    const word = idxBuffer.slice(offset, end).toString("utf8").toLowerCase();
    const dataOffset = idxBuffer.readUInt32BE(end + 1);
    const size = idxBuffer.readUInt32BE(end + 5);
    entries.push({ word, dataOffset, size });
    offset = end + 9;
  }
  return entries;
}

/**
 * Extract Chinese translation strings from a StarDict HTML entry.
 * Only values containing at least one CJK unified ideograph (U+3400\u2013U+9FFF)
 * are returned.
 *
 * @param {string} html - HTML content of a single StarDict entry.
 * @returns {string[]} Deduplicated list of Chinese translation strings.
 */
function extractTranslations(html) {
  const translations = [];
  const seen = new Set();
  for (const match of html.matchAll(/<li>\s*<div>([\s\S]*?)<\/div>\s*<\/li>|<div>([^<][\s\S]*?)<\/div>/g)) {
    const text = stripTags(match[1] || match[2]);
    if (!text || !/[\u3400-\u9fff]/.test(text) || seen.has(text)) continue;
    seen.add(text);
    translations.push(text);
  }
  return translations;
}

/**
 * Extract a plain-text definition from a StarDict HTML entry, truncated to 500 chars.
 *
 * @param {string} html - HTML content of a single StarDict entry.
 * @returns {string} Plain-text definition.
 */
function extractDefinition(html) {
  const afterGrammar = html.replace(/^[\s\S]*?<font[^>]*class="grammar"[\s\S]*?<\/font>\s*<\/div>/i, "");
  const withoutLists = afterGrammar.replace(/<ol[\s\S]*$/i, "");
  const text = stripTags(withoutLists);
  return text.slice(0, 500);
}

/**
 * Extract the part-of-speech tag from a StarDict HTML entry's grammar annotation.
 *
 * @param {string} html - HTML content of a single StarDict entry.
 * @returns {"noun"|"verb"|"adjective"|"adverb"|""} Canonical POS string.
 */
function extractPos(html) {
  const match = html.match(/<font[^>]*class="grammar"[^>]*>([\s\S]*?)<\/font>/i);
  return posForLabel(stripTags(match?.[1] || ""));
}

const zip = await JSZip.loadAsync(readFileSync(sourcePath));
const idxFile = zip.file("wikdict-en-zh/stardict.idx") || zip.file("stardict.idx");
const dictFile = zip.file("wikdict-en-zh/stardict.dict") || zip.file("stardict.dict");
if (!idxFile || !dictFile) {
  throw new Error("WikDict StarDict files were not found in the zip.");
}

const idxBuffer = Buffer.from(await idxFile.async("nodebuffer"));
const dictBuffer = Buffer.from(await dictFile.async("nodebuffer"));

let entries = 0;
let rows = 0;
try {
  await db.transaction(async (tx) => {
    const insert = tx.prepare(`
      INSERT INTO wikdict_english_chinese (english, chinese, pos, rank, definition)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (english, chinese) DO UPDATE SET
        pos = EXCLUDED.pos,
        rank = EXCLUDED.rank,
        definition = EXCLUDED.definition
    `);
    await tx.prepare("DELETE FROM wikdict_english_chinese").run();
    for (const entry of readIdxEntries(idxBuffer)) {
      if (!/^[a-z][a-z'-]{1,80}$/.test(entry.word)) continue;
      entries += 1;
      const html = dictBuffer.slice(entry.dataOffset, entry.dataOffset + entry.size).toString("utf8");
      const pos = extractPos(html) || null;
      const definition = extractDefinition(html) || null;
      const translations = extractTranslations(html);
      for (const [index, translation] of translations.entries()) {
        await insert.run(entry.word, translation, pos, index, definition);
        rows += 1;
      }
    }
  });
} finally {
  await pool.end();
}

console.log(JSON.stringify({ entries, rows }, null, 2));

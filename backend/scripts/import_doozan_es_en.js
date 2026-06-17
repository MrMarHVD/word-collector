/**
 * @file import_doozan_es_en.js
 * @description Imports the Doozan Spanish-English Wiktionary StarDict dictionary into
 * the `wikdict_spanish_english` and `wikdict_spanish_english_aliases` tables. This is
 * an alternative Spanish source to WikDict; both write to the same target tables so
 * only one should be run at a time.
 *
 * Source format: StarDict zip (`Spanish-English-Wiktionary.StarDict.zip`) containing:
 *  - `es-en.enwikt.idx`      — binary index
 *  - `es-en.enwikt.dict.dz`  — gzip-compressed dict data
 *  - `es-en.enwikt.syn`      — synonym/alias file
 *
 * The import resolves the canonical headword per entry from the HTML structure itself
 * (the `<b>` tag), using the `.idx` word only as a fallback. Inflected forms from the
 * `.syn` file are inserted as alias rows pointing at the resolved canonical headword.
 *
 * Database side effects:
 *  - Truncates `wikdict_spanish_english_aliases` and `wikdict_spanish_english`, then
 *    rebuilds both within a single transaction.
 *  - Suppresses a small set of known bad translations via `BAD_TRANSLATIONS`.
 *  - Filters out inflection meta-entries (e.g. "smart inflection of …") and
 *    overly long or non-alphabetic translations.
 *
 * CLI usage:
 * ```
 * node backend/scripts/import_doozan_es_en.js [zipPath]
 * ```
 * Optional first argument overrides the default zip path:
 * `<ROOT>/data/dictionaries/Spanish-English-Wiktionary.StarDict.zip`.
 *
 * Exits with a JSON summary `{ entries, rows, aliases }` printed to stdout.
 * Requires `DATABASE_URL` (or equivalent db config) to be set in the environment.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import JSZip from "jszip";
import { db, pool } from "../src/db/index.js";
import { ROOT } from "../src/config.js";

const sourcePath = process.argv[2] || join(ROOT, "data", "dictionaries", "Spanish-English-Wiktionary.StarDict.zip");

/**
 * Decode HTML entities in a StarDict entry field. Handles the extended set of
 * numeric entities (`&#x27;`) used in Doozan data in addition to the standard set.
 *
 * @param {unknown} value - Raw value from the dictionary entry.
 * @returns {string} Value with common HTML entities replaced by their characters.
 */
function decodeHtml(value) {
  return String(value || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#x27;/g, "'")
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
 * Map a Doozan grammar label to a canonical POS tag. Uses abbreviated forms
 * (e.g. "adj", "adv", "prep", "conj", "pron") as found in Doozan italic annotations.
 *
 * @param {unknown} value - Grammar label text from the dictionary entry.
 * @returns {"noun"|"verb"|"adjective"|"adverb"|"preposition"|"conjunction"|"pronoun"|""}
 *   Canonical POS string, or empty string for unrecognised labels.
 */
function posForLabel(value) {
  const clean = String(value || "").toLowerCase();
  if (clean.includes("noun")) return "noun";
  if (clean.includes("verb")) return "verb";
  if (clean.includes("adj")) return "adjective";
  if (clean.includes("adv")) return "adverb";
  if (clean.includes("prep")) return "preposition";
  if (clean.includes("conj")) return "conjunction";
  if (clean.includes("pron")) return "pronoun";
  return "";
}

const BAD_TRANSLATIONS = new Map([
  ["azud", new Set(["waterwheel"])]
]);

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
 * Parse a StarDict `.syn` synonyms buffer into alias records.
 *
 * @param {Buffer} synBuffer - Contents of a StarDict `.syn` file.
 * @param {{ word: string }[]} idxEntries - Previously parsed index entries used to
 *   resolve numeric offsets to headword strings.
 * @returns {{ word: string, headword: string, index: number }[]} Alias records.
 */
function readSynEntries(synBuffer, idxEntries) {
  const entries = [];
  let offset = 0;
  while (offset < synBuffer.length) {
    const end = synBuffer.indexOf(0, offset);
    if (end === -1 || end + 5 > synBuffer.length) break;
    const word = synBuffer.slice(offset, end).toString("utf8").toLowerCase();
    const index = synBuffer.readUInt32BE(end + 1);
    const headword = idxEntries[index]?.word;
    if (word && headword && word !== headword) {
      entries.push({ word, headword, index });
    }
    offset = end + 5;
  }
  return entries;
}

/**
 * Normalise a raw translation string from a Doozan entry: strip HTML tags,
 * remove inline synonym lists ("Synonyms: …"), and strip leading bracket
 * annotations (e.g. "[colloquial] ").
 *
 * @param {string} value - Raw translation text, possibly containing HTML.
 * @returns {string} Clean plain-text translation.
 */
function cleanTranslation(value) {
  return stripTags(value)
    .replace(/\s*Synonyms?:.*$/i, "")
    .replace(/^\[[^\]]+\]\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extract all translation entries from a Doozan HTML block. Each Doozan entry
 * block follows the pattern `<b>headword</b> <i>pos</i> <ol><li>…</li></ol>`.
 * Inflection meta-entries (e.g. "smart inflection of …"), pure surname entries,
 * and translations exceeding 160 characters are filtered out.
 *
 * @param {string} html - HTML content of a single StarDict entry.
 * @returns {{ headword: string, translation: string, pos: string, rank: number }[]}
 *   Extracted translation entries with their resolved headword and ordinal rank.
 */
function extractEntries(html) {
  const entries = [];
  const sections = html.matchAll(/<b>([\s\S]*?)<\/b>\s*<i>([\s\S]*?)<\/i>[\s\S]*?<ol[^>]*>([\s\S]*?)<\/ol>/g);
  for (const section of sections) {
    const headword = stripTags(section[1]).toLowerCase();
    const pos = posForLabel(stripTags(section[2]));
    let rank = 0;
    for (const item of section[3].matchAll(/<li>([\s\S]*?)<\/li>/g)) {
      const translation = cleanTranslation(item[1]);
      if (!translation) continue;
      if (!/[A-Za-z]/.test(translation)) continue;
      if (/^smart inflection of\b/i.test(translation)) continue;
      if (/\binflection of\b/i.test(translation)) continue;
      if (/^makes .* auxiliary verb\b/i.test(translation)) continue;
      if (translation.toLowerCase() === "surname") continue;
      if (BAD_TRANSLATIONS.get(headword)?.has(translation.toLowerCase())) continue;
      if (translation.length > 160) continue;
      entries.push({ headword, translation, pos, rank });
      rank += 1;
    }
  }
  return entries;
}

const zip = await JSZip.loadAsync(readFileSync(sourcePath));
const idxFile = zip.file("es-en.enwikt.idx");
const synFile = zip.file("es-en.enwikt.syn");
const dictFile = zip.file("es-en.enwikt.dict.dz");
if (!idxFile || !synFile || !dictFile) {
  throw new Error("Doozan Spanish-English StarDict files were not found in the zip.");
}

const idxEntries = readIdxEntries(Buffer.from(await idxFile.async("nodebuffer")));
const synEntries = readSynEntries(Buffer.from(await synFile.async("nodebuffer")), idxEntries);
const dictBuffer = gunzipSync(Buffer.from(await dictFile.async("nodebuffer")));

let entries = 0;
let rows = 0;
let aliases = 0;
const canonicalByIndex = new Map();
try {
  await db.transaction(async (tx) => {
    const insertEntry = tx.prepare(`
      INSERT INTO wikdict_spanish_english (spanish, english, pos, rank, definition)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (spanish, english) DO UPDATE SET
        pos = EXCLUDED.pos,
        rank = EXCLUDED.rank,
        definition = EXCLUDED.definition
    `);
    const insertAlias = tx.prepare(`
      INSERT INTO wikdict_spanish_english_aliases (spanish, headword)
      VALUES (?, ?)
      ON CONFLICT (spanish) DO NOTHING
    `);

    await tx.prepare("DELETE FROM wikdict_spanish_english_aliases").run();
    await tx.prepare("DELETE FROM wikdict_spanish_english").run();
    for (const [index, entry] of idxEntries.entries()) {
      if (!/^[\p{Letter}][\p{Letter}'’ -]{0,100}$/u.test(entry.word)) continue;
      const html = dictBuffer.slice(entry.dataOffset, entry.dataOffset + entry.size).toString("utf8");
      const translations = extractEntries(html);
      if (!translations.length) continue;
      const canonical = translations.find((translation) => /^[\p{Letter}][\p{Letter}'’ -]{0,100}$/u.test(translation.headword))?.headword || entry.word;
      canonicalByIndex.set(index, canonical);
      entries += 1;
      for (const [rank, translation] of translations.entries()) {
        const headword = /^[\p{Letter}][\p{Letter}'’ -]{0,100}$/u.test(translation.headword) ? translation.headword : canonical;
        await insertEntry.run(headword, translation.translation, translation.pos || null, rank, null);
        rows += 1;
      }
      if (entry.word !== canonical) {
        await insertAlias.run(entry.word, canonical);
        aliases += 1;
      }
    }
    for (const alias of synEntries) {
      const headword = canonicalByIndex.get(alias.index) || alias.headword;
      if (!/^[\p{Letter}][\p{Letter}'’ -]{0,100}$/u.test(alias.word)) continue;
      if (!/^[\p{Letter}][\p{Letter}'’ -]{0,100}$/u.test(headword)) continue;
      await insertAlias.run(alias.word, headword);
      aliases += 1;
    }
  });
} finally {
  await pool.end();
}

console.log(JSON.stringify({ entries, rows, aliases }, null, 2));

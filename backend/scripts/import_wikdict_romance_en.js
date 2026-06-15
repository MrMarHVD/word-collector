/**
 * @file import_wikdict_romance_en.js
 * @description Imports WikDict Romance-language→English dictionaries from StarDict zip
 * archives into the corresponding database tables. Currently supports Spanish and French.
 * The target table is cleared and rebuilt within a single transaction.
 *
 * For each language:
 *  - Headword rows are inserted into the language-specific main table
 *    (`wikdict_spanish_english` or `wikdict_french_english`).
 *  - Inflected-form aliases (from the `.syn` file) are inserted into the
 *    corresponding alias table (`wikdict_spanish_english_aliases` or
 *    `wikdict_french_english_aliases`), where supported.
 *  - Per-language `preferredTranslations` reorder ambiguous entries.
 *  - `BAD_TRANSLATIONS` suppresses known incorrect or misleading translations.
 *  - `customTranslations` (French only) injects entries not present in the source data.
 *
 * CLI usage:
 * ```
 * node backend/scripts/import_wikdict_romance_en.js spanish|french [zipPath]
 * ```
 * The first argument selects the language. The optional second argument overrides
 * the default zip path (see `IMPORTS` for defaults).
 *
 * Database side effects:
 *  - Truncates and rebuilds the selected language table and its alias table.
 *
 * Exits with a JSON summary `{ language, entries, rows, aliases }` printed to stdout.
 * Requires `DATABASE_URL` (or equivalent db config) to be set in the environment.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import JSZip from "jszip";
import { db, pool } from "../src/db/index.js";
import { ROOT } from "../src/config.js";

const IMPORTS = {
  spanish: {
    sourcePath: join(ROOT, "data", "dictionaries", "wikdict-es-en.zip"),
    zipDir: "wikdict-es-en",
    table: "wikdict_spanish_english",
    sourceColumn: "spanish"
  },
  french: {
    sourcePath: join(ROOT, "data", "dictionaries", "wikdict-fr-en.zip"),
    zipDir: "wikdict-fr-en",
    table: "wikdict_french_english",
    sourceColumn: "french",
    aliasTable: "wikdict_french_english_aliases",
    preferredTranslations: {
      aller: ["go", "be going to", "travel"],
      ami: ["friend", "pal", "mate", "friendly"],
      grand: ["big", "large", "great", "tall"],
      meilleur: ["better", "best"],
      dé: ["dice", "die"],
      qi: ["chi", "qi"]
    },
    customTranslations: [
      { source: "n’avoir ni queue ni tête", translation: "not make head or tail of", pos: "verb" }
    ]
  }
};

const BAD_TRANSLATIONS = new Map([
  ["ne pas être sans ignorer", new Set(["could care less", "not give a tinker's cuss", "not give a tinker's damn"])],
  ["jouer du violon", new Set(["play someone like a fiddle", "play someone like a violin"])],
  ["immobiliser", new Set(["immobile"])],
  ["n’avoir ni queue ni tête", new Set(["make head or tail of"])],
  ["qi", new Set(["iq"])]
]);

const language = String(process.argv[2] || "").toLowerCase();
const config = IMPORTS[language];
if (!config) {
  throw new Error("Usage: node scripts/import_wikdict_romance_en.js spanish|french [zipPath]");
}
const sourcePath = process.argv[3] || config.sourcePath;

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
 * Map a grammar label string to a canonical POS tag. Includes preposition,
 * conjunction, and pronoun in addition to the base set, as Romance-language
 * entries use these more frequently.
 *
 * @param {unknown} value - Grammar label text from the dictionary entry.
 * @returns {"noun"|"verb"|"adjective"|"adverb"|"preposition"|"conjunction"|"pronoun"|""}
 *   Canonical POS string, or empty string for unrecognised labels.
 */
function posForLabel(value) {
  const clean = String(value || "").toLowerCase();
  if (clean.includes("noun")) return "noun";
  if (clean.includes("verb")) return "verb";
  if (clean.includes("adjective")) return "adjective";
  if (clean.includes("adverb")) return "adverb";
  if (clean.includes("preposition")) return "preposition";
  if (clean.includes("conjunction")) return "conjunction";
  if (clean.includes("pronoun")) return "pronoun";
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
 * Parse a StarDict `.syn` synonyms buffer into alias records that map inflected
 * forms to their headword entry in the `.idx` table.
 *
 * @param {Buffer} synBuffer - Contents of a StarDict `.syn` file.
 * @param {{ word: string }[]} idxEntries - The previously parsed index entries,
 *   used to resolve index offsets to headword strings.
 * @returns {{ word: string, headword: string }[]} Alias pairs where `word` is the
 *   inflected form and `headword` is the canonical entry word.
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
      entries.push({ word, headword });
    }
    offset = end + 5;
  }
  return entries;
}

/**
 * Extract English translation strings from a Romance-language StarDict HTML entry.
 * Filters out non-ASCII, pure POS labels, IPA notation (starting with "/"), and
 * entries longer than 120 characters.
 *
 * @param {string} html - HTML content of a single StarDict entry.
 * @returns {string[]} Deduplicated list of English translation strings.
 */
function extractTranslations(html) {
  const translations = [];
  const seen = new Set();
  for (const match of html.matchAll(/<li>\s*<div>([\s\S]*?)<\/div>\s*<\/li>|<div>([^<][\s\S]*?)<\/div>/g)) {
    const text = stripTags(match[1] || match[2]);
    if (!text || seen.has(text)) continue;
    if (!/[A-Za-z]/.test(text)) continue;
    if (!/^[\x20-\x7e]+$/.test(text)) continue;
    if (text.startsWith("/")) continue;
    if (/^(noun|verb|adjective|adverb|preposition|conjunction|pronoun)(, (male|female|plural|singular))*$/i.test(text)) continue;
    if (text.length > 120) continue;
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
 * @returns {"noun"|"verb"|"adjective"|"adverb"|"preposition"|"conjunction"|"pronoun"|""}
 *   Canonical POS string.
 */
function extractPos(html) {
  const match = html.match(/<font[^>]*class="grammar"[^>]*>([\s\S]*?)<\/font>/i);
  return posForLabel(stripTags(match?.[1] || ""));
}

const zip = await JSZip.loadAsync(readFileSync(sourcePath));
const idxFile = zip.file(`${config.zipDir}/stardict.idx`) || zip.file("stardict.idx");
const dictFile = zip.file(`${config.zipDir}/stardict.dict`) || zip.file("stardict.dict");
const synFile = zip.file(`${config.zipDir}/stardict.syn`) || zip.file("stardict.syn");
if (!idxFile || !dictFile) {
  throw new Error("WikDict StarDict files were not found in the zip.");
}

const idxBuffer = Buffer.from(await idxFile.async("nodebuffer"));
const idxEntries = readIdxEntries(idxBuffer);
const synEntries = synFile ? readSynEntries(Buffer.from(await synFile.async("nodebuffer")), idxEntries) : [];
const dictBuffer = Buffer.from(await dictFile.async("nodebuffer"));

let entries = 0;
let rows = 0;
let aliases = 0;
try {
  await db.transaction(async (tx) => {
    const insert = tx.prepare(`
      INSERT INTO ${config.table} (${config.sourceColumn}, english, pos, rank, definition)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (${config.sourceColumn}, english) DO UPDATE SET
        pos = EXCLUDED.pos,
        rank = EXCLUDED.rank,
        definition = EXCLUDED.definition
    `);
    const insertAlias = config.aliasTable ? tx.prepare(`
      INSERT INTO ${config.aliasTable} (${config.sourceColumn}, headword)
      VALUES (?, ?)
      ON CONFLICT (${config.sourceColumn}) DO NOTHING
    `) : null;

    if (config.aliasTable) {
      await tx.prepare(`DELETE FROM ${config.aliasTable}`).run();
    }
    await tx.prepare(`DELETE FROM ${config.table}`).run();
    for (const entry of idxEntries) {
      if (!/^[\p{Letter}][\p{Letter}'’ -]{1,100}$/u.test(entry.word)) continue;
      entries += 1;
      const html = dictBuffer.slice(entry.dataOffset, entry.dataOffset + entry.size).toString("utf8");
      const pos = extractPos(html) || null;
      const definition = extractDefinition(html) || null;
      const preferred = config.preferredTranslations?.[entry.word] || [];
      const translations = extractTranslations(html).sort((left, right) => {
        const leftIndex = preferred.indexOf(left.toLowerCase());
        const rightIndex = preferred.indexOf(right.toLowerCase());
        if (leftIndex === -1 && rightIndex === -1) return 0;
        if (leftIndex === -1) return 1;
        if (rightIndex === -1) return -1;
        return leftIndex - rightIndex;
      });
      for (const [index, translation] of translations.entries()) {
        if (BAD_TRANSLATIONS.get(entry.word)?.has(translation.toLowerCase())) {
          continue;
        }
        await insert.run(entry.word, translation, pos, index, definition);
        rows += 1;
      }
    }
    if (insertAlias) {
      for (const alias of synEntries) {
        if (!/^[\p{Letter}][\p{Letter}'’ -]{1,100}$/u.test(alias.word)) continue;
        if (!/^[\p{Letter}][\p{Letter}'’ -]{1,100}$/u.test(alias.headword)) continue;
        await insertAlias.run(alias.word, alias.headword);
        aliases += 1;
      }
    }
    for (const custom of config.customTranslations || []) {
      await insert.run(custom.source, custom.translation, custom.pos || null, 0, null);
      rows += 1;
    }
  });
} finally {
  await pool.end();
}

console.log(JSON.stringify({ language, entries, rows, aliases }, null, 2));

import { readFileSync } from "node:fs";
import { join } from "node:path";
import JSZip from "jszip";
import { DatabaseSync } from "node:sqlite";
import { DB_PATH, ROOT } from "../src/config.js";
import { runMigrations } from "../src/db/migrate.js";

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
    sourceColumn: "french"
  }
};

const language = String(process.argv[2] || "").toLowerCase();
const config = IMPORTS[language];
if (!config) {
  throw new Error("Usage: node scripts/import_wikdict_romance_en.js spanish|french [zipPath]");
}
const sourcePath = process.argv[3] || config.sourcePath;

function decodeHtml(value) {
  return String(value || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function stripTags(value) {
  return decodeHtml(String(value || "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

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

function extractDefinition(html) {
  const afterGrammar = html.replace(/^[\s\S]*?<font[^>]*class="grammar"[\s\S]*?<\/font>\s*<\/div>/i, "");
  const withoutLists = afterGrammar.replace(/<ol[\s\S]*$/i, "");
  const text = stripTags(withoutLists);
  return text.slice(0, 500);
}

function extractPos(html) {
  const match = html.match(/<font[^>]*class="grammar"[^>]*>([\s\S]*?)<\/font>/i);
  return posForLabel(stripTags(match?.[1] || ""));
}

const zip = await JSZip.loadAsync(readFileSync(sourcePath));
const idxFile = zip.file(`${config.zipDir}/stardict.idx`) || zip.file("stardict.idx");
const dictFile = zip.file(`${config.zipDir}/stardict.dict`) || zip.file("stardict.dict");
if (!idxFile || !dictFile) {
  throw new Error("WikDict StarDict files were not found in the zip.");
}

const idxBuffer = Buffer.from(await idxFile.async("nodebuffer"));
const dictBuffer = Buffer.from(await dictFile.async("nodebuffer"));
const db = new DatabaseSync(DB_PATH);
runMigrations(db);

const insert = db.prepare(`
  INSERT OR REPLACE INTO ${config.table} (${config.sourceColumn}, english, pos, rank, definition)
  VALUES (?, ?, ?, ?, ?)
`);

let entries = 0;
let rows = 0;
db.exec("BEGIN");
try {
  db.exec(`DELETE FROM ${config.table}`);
  for (const entry of readIdxEntries(idxBuffer)) {
    if (!/^[\p{Letter}][\p{Letter}'’ -]{1,100}$/u.test(entry.word)) continue;
    entries += 1;
    const html = dictBuffer.slice(entry.dataOffset, entry.dataOffset + entry.size).toString("utf8");
    const pos = extractPos(html) || null;
    const definition = extractDefinition(html) || null;
    const translations = extractTranslations(html);
    translations.forEach((translation, index) => {
      insert.run(entry.word, translation, pos, index, definition);
      rows += 1;
    });
  }
  db.exec("COMMIT");
} catch (error) {
  db.exec("ROLLBACK");
  throw error;
} finally {
  db.close();
}

console.log(JSON.stringify({ language, entries, rows }, null, 2));

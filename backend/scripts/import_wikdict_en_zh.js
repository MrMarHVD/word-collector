import { readFileSync } from "node:fs";
import { join } from "node:path";
import JSZip from "jszip";
import { DatabaseSync } from "node:sqlite";
import { DB_PATH, ROOT } from "../src/config.js";
import { runMigrations } from "../src/db/migrate.js";

const sourcePath = process.argv[2] || join(ROOT, "data", "dictionaries", "wikdict-en-zh.zip");

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
    if (!text || !/[\u3400-\u9fff]/.test(text) || seen.has(text)) continue;
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
const idxFile = zip.file("wikdict-en-zh/stardict.idx") || zip.file("stardict.idx");
const dictFile = zip.file("wikdict-en-zh/stardict.dict") || zip.file("stardict.dict");
if (!idxFile || !dictFile) {
  throw new Error("WikDict StarDict files were not found in the zip.");
}

const idxBuffer = Buffer.from(await idxFile.async("nodebuffer"));
const dictBuffer = Buffer.from(await dictFile.async("nodebuffer"));
const db = new DatabaseSync(DB_PATH);
runMigrations(db);

const insert = db.prepare(`
  INSERT OR REPLACE INTO wikdict_english_chinese (english, chinese, pos, rank, definition)
  VALUES (?, ?, ?, ?, ?)
`);

let entries = 0;
let rows = 0;
db.exec("BEGIN");
try {
  db.exec("DELETE FROM wikdict_english_chinese");
  for (const entry of readIdxEntries(idxBuffer)) {
    if (!/^[a-z][a-z'-]{1,80}$/.test(entry.word)) continue;
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

console.log(JSON.stringify({ entries, rows }, null, 2));

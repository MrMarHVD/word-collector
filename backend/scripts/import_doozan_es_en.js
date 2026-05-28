import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import JSZip from "jszip";
import { DatabaseSync } from "node:sqlite";
import { DB_PATH, ROOT } from "../src/config.js";
import { runMigrations } from "../src/db/migrate.js";

const sourcePath = process.argv[2] || join(ROOT, "data", "dictionaries", "Spanish-English-Wiktionary.StarDict.zip");

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

function stripTags(value) {
  return decodeHtml(String(value || "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

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

function cleanTranslation(value) {
  return stripTags(value)
    .replace(/\s*Synonyms?:.*$/i, "")
    .replace(/^\[[^\]]+\]\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

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

const db = new DatabaseSync(DB_PATH);
runMigrations(db);

const insertEntry = db.prepare(`
  INSERT OR REPLACE INTO wikdict_spanish_english (spanish, english, pos, rank, definition)
  VALUES (?, ?, ?, ?, ?)
`);
const insertAlias = db.prepare(`
  INSERT OR IGNORE INTO wikdict_spanish_english_aliases (spanish, headword)
  VALUES (?, ?)
`);

let entries = 0;
let rows = 0;
let aliases = 0;
const canonicalByIndex = new Map();
db.exec("BEGIN");
try {
  db.exec("DELETE FROM wikdict_spanish_english_aliases");
  db.exec("DELETE FROM wikdict_spanish_english");
  for (const [index, entry] of idxEntries.entries()) {
    if (!/^[\p{Letter}][\p{Letter}'’ -]{0,100}$/u.test(entry.word)) continue;
    const html = dictBuffer.slice(entry.dataOffset, entry.dataOffset + entry.size).toString("utf8");
    const translations = extractEntries(html);
    if (!translations.length) continue;
    const canonical = translations.find((translation) => /^[\p{Letter}][\p{Letter}'’ -]{0,100}$/u.test(translation.headword))?.headword || entry.word;
    canonicalByIndex.set(index, canonical);
    entries += 1;
    translations.forEach((translation, index) => {
      const headword = /^[\p{Letter}][\p{Letter}'’ -]{0,100}$/u.test(translation.headword) ? translation.headword : canonical;
      insertEntry.run(headword, translation.translation, translation.pos || null, index, null);
      rows += 1;
    });
    if (entry.word !== canonical) {
      insertAlias.run(entry.word, canonical);
      aliases += 1;
    }
  }
  for (const alias of synEntries) {
    const headword = canonicalByIndex.get(alias.index) || alias.headword;
    if (!/^[\p{Letter}][\p{Letter}'’ -]{0,100}$/u.test(alias.word)) continue;
    if (!/^[\p{Letter}][\p{Letter}'’ -]{0,100}$/u.test(headword)) continue;
    insertAlias.run(alias.word, headword);
    aliases += 1;
  }
  db.exec("COMMIT");
} catch (error) {
  db.exec("ROLLBACK");
  throw error;
} finally {
  db.close();
}

console.log(JSON.stringify({ entries, rows, aliases }, null, 2));

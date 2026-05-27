import { createGunzip } from "node:zlib";
import { createReadStream } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { DB_PATH, ROOT } from "../src/config.js";
import { runMigrations } from "../src/db/migrate.js";

// Build local Japanese-English and English-Japanese lookup indexes from JMdict.
const sourcePath = process.argv[2] || join(ROOT, "data", "dictionaries", "JMdict_e.gz");

// Read and decompress a gzipped JMdict XML file.
function readGzip(path) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    createReadStream(path)
      .pipe(createGunzip())
      .on("data", (chunk) => chunks.push(chunk))
      .on("error", reject)
      .on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}

// Extract decoded XML tag values from one dictionary entry.
function values(entry, tag) {
  return [...entry.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "g"))].map((match) => decodeXml(match[1].trim()));
}

// Decode the XML entities used in JMdict text fields.
function decodeXml(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");
}

// Give priority to entries that JMdict marks as common.
function priorityFor(entry) {
  return /<ke_pri>|<re_pri>/.test(entry) ? 1 : 0;
}

const xml = await readGzip(sourcePath);
const db = new DatabaseSync(DB_PATH);
runMigrations(db);

const insert = db.prepare(`
  INSERT OR REPLACE INTO jmdict_entries (expression, reading, gloss, priority)
  VALUES (?, ?, ?, ?)
`);
const insertEnglish = db.prepare(`
  INSERT OR REPLACE INTO jmdict_english_index (english, expression, gloss, priority)
  VALUES (?, ?, ?, ?)
`);

// Produce reverse-lookup English keys from gloss text.
function englishKeys(glosses) {
  // English reader tokens are single words, so only index single-word glosses.
  const keys = new Set();
  for (const gloss of glosses) {
    const parts = gloss.split(/[;,]/).map((part) => part.trim().toLowerCase());
    for (const part of parts) {
      if (/^[a-z][a-z'-]{1,60}$/.test(part)) {
        keys.add(part);
      }
    }
  }
  return [...keys];
}

let entries = 0;
let rows = 0;
db.exec("BEGIN");
try {
  // Rebuild the derived index from source data.
  db.exec("DELETE FROM jmdict_entries");
  db.exec("DELETE FROM jmdict_english_index");
  for (const match of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    entries += 1;
    const entry = match[1];
    const expressions = values(entry, "keb");
    const readings = values(entry, "reb");
    const glosses = values(entry, "gloss").filter(Boolean);
    const forms = expressions.length ? expressions : readings;
    const reading = readings[0] || null;
    const priority = priorityFor(entry);
    for (const form of forms) {
      const gloss = [...new Set(glosses)].slice(0, 6).join("; ");
      if (form && gloss) {
        insert.run(form, reading, gloss, priority);
        for (const english of englishKeys(glosses)) {
          insertEnglish.run(english, form, gloss, priority);
        }
        rows += 1;
      }
    }
  }
  db.exec("COMMIT");
} catch (error) {
  db.exec("ROLLBACK");
  throw error;
} finally {
  db.close();
}

console.log(JSON.stringify({ entries, rows }, null, 2));

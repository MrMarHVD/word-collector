import { createGunzip } from "node:zlib";
import { createReadStream } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { DB_PATH } from "../src/config.js";
import { runMigrations } from "../src/db/migrate.js";

const sourcePath = process.argv[2] || "data/dictionaries/JMdict_e.gz";

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

function values(entry, tag) {
  return [...entry.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "g"))].map((match) => decodeXml(match[1].trim()));
}

function decodeXml(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");
}

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

function englishKeys(glosses) {
  const keys = new Set();
  for (const gloss of glosses) {
    const first = gloss.split(";")[0].split(",")[0].trim().toLowerCase();
    if (/^[a-z][a-z '-]{1,60}$/.test(first)) {
      keys.add(first);
      first
        .split(/\s+/)
        .filter((part) => /^[a-z][a-z'-]{2,}$/.test(part))
        .forEach((part) => keys.add(part));
    }
  }
  return [...keys];
}

let entries = 0;
let rows = 0;
db.exec("BEGIN");
try {
  db.exec("DELETE FROM jmdict_entries");
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

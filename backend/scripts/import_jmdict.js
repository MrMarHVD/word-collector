import { createGunzip } from "node:zlib";
import { createReadStream } from "node:fs";
import { join } from "node:path";
import { db, pool } from "../src/db/index.js";
import { ROOT } from "../src/config.js";

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

function posForCode(code) {
  const clean = String(code || "").replaceAll("&", "").replaceAll(";", "");
  if (clean === "n" || clean.startsWith("n-")) return "noun";
  if (clean.startsWith("v")) return "verb";
  if (clean.startsWith("adj")) return "adjective";
  if (clean.startsWith("adv")) return "adverb";
  return "";
}

function posForSense(sense) {
  const values = [...sense.matchAll(/<pos>([\s\S]*?)<\/pos>/g)]
    .map((match) => posForCode(match[1].trim()))
    .filter(Boolean);
  return values[0] || "";
}

function senses(entry) {
  return [...entry.matchAll(/<sense>([\s\S]*?)<\/sense>/g)].map((match) => ({
    glosses: values(match[1], "gloss").filter(Boolean),
    pos: posForSense(match[1])
  }));
}

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
try {
  await db.transaction(async (tx) => {
    const insert = tx.prepare(`
      INSERT INTO jmdict_entries (expression, reading, gloss, priority)
      VALUES (?, ?, ?, ?)
      ON CONFLICT (expression, gloss) DO UPDATE SET
        reading = EXCLUDED.reading,
        priority = EXCLUDED.priority
    `);
    const insertEnglish = tx.prepare(`
      INSERT INTO jmdict_english_index (english, expression, gloss, pos, priority)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (english, expression) DO UPDATE SET
        gloss = EXCLUDED.gloss,
        pos = EXCLUDED.pos,
        priority = EXCLUDED.priority
    `);
    // Rebuild the derived index from source data.
    await tx.prepare("DELETE FROM jmdict_entries").run();
    await tx.prepare("DELETE FROM jmdict_english_index").run();
    for (const match of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
      entries += 1;
      const entry = match[1];
      const expressions = values(entry, "keb");
      const readings = values(entry, "reb");
      const forms = expressions.length ? expressions : readings;
      const reading = readings[0] || null;
      const priority = priorityFor(entry);
      const entrySenses = senses(entry);
      const glosses = entrySenses.flatMap((sense) => sense.glosses);
      for (const form of forms) {
        const gloss = [...new Set(glosses)].slice(0, 6).join("; ");
        if (form && gloss) {
          await insert.run(form, reading, gloss, priority);
          for (const sense of entrySenses) {
            for (const english of englishKeys(sense.glosses)) {
              await insertEnglish.run(english, form, gloss, sense.pos || null, priority);
            }
          }
          rows += 1;
        }
      }
    }
  });
} finally {
  await pool.end();
}

console.log(JSON.stringify({ entries, rows }, null, 2));

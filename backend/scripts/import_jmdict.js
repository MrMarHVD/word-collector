/**
 * @file import_jmdict.js
 * @description Builds Japanese-English and English-Japanese lookup indexes from the
 * JMdict XML dictionary (gzip-compressed). Populates two tables:
 *  - `jmdict_entries`       — one row per (expression, gloss); the primary
 *    Japanese→English lookup used by the text reader.
 *  - `jmdict_english_index` — reverse lookup keyed on individual English words
 *    extracted from gloss text; used when the user's native language is English.
 *
 * Both tables are cleared and rebuilt within a single transaction.
 *
 * Source format: gzip-compressed JMdict XML (`JMdict_e.gz`). Each `<entry>`
 * element may contain multiple kanji forms (`<keb>`), readings (`<reb>`), and
 * senses (`<sense>` / `<gloss>`). Priority tags (`ke_pri`, `re_pri`) are scored
 * to rank common-use entries above rare ones.
 *
 * CLI usage:
 * ```
 * node backend/scripts/import_jmdict.js [gzPath]
 * ```
 * Optional first argument overrides the default path:
 * `<ROOT>/data/dictionaries/JMdict_e.gz`.
 *
 * Exits with a JSON summary `{ entries, rows }` printed to stdout.
 * Requires `DATABASE_URL` (or equivalent db config) to be set in the environment.
 */
import { createGunzip } from "node:zlib";
import { createReadStream } from "node:fs";
import { join } from "node:path";
import { db, pool } from "../src/db/index.js";
import { ROOT } from "../src/config.js";

// Build local Japanese-English and English-Japanese lookup indexes from JMdict.
const sourcePath = process.argv[2] || join(ROOT, "data", "dictionaries", "JMdict_e.gz");

/**
 * Read and decompress a gzipped JMdict XML file.
 *
 * @param {string} path - Absolute path to a `.gz` file.
 * @returns {Promise<string>} Decompressed UTF-8 XML content.
 */
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

/**
 * Extract decoded text values of all occurrences of a given XML tag within
 * a single JMdict entry string.
 *
 * @param {string} entry - Raw XML text of one `<entry>` block.
 * @param {string} tag   - XML tag name to match (e.g. `"keb"`, `"reb"`, `"gloss"`).
 * @returns {string[]} Trimmed, XML-decoded inner text of every matching element.
 */
function values(entry, tag) {
  return [...entry.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "g"))].map((match) => decodeXml(match[1].trim()));
}

/**
 * Decode the XML entities used in JMdict text fields.
 *
 * @param {string} value - Raw XML text value.
 * @returns {string} Value with `&amp;`, `&lt;`, `&gt;`, `&quot;`, `&apos;` replaced.
 */
function decodeXml(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");
}

const PRIORITY_WEIGHTS = {
  news1: 80,
  ichi1: 70,
  spec1: 60,
  gai1: 50,
  news2: 40,
  ichi2: 35,
  spec2: 30,
  gai2: 25
};

/**
 * Derive a numeric priority score for a JMdict entry from its priority tags.
 * Higher values indicate more common vocabulary. Tags are mapped via
 * `PRIORITY_WEIGHTS`; the maximum score across all tags is returned.
 *
 * @param {string} entry - Raw XML text of one `<entry>` block.
 * @returns {number} Priority score (0 = no priority tags).
 */
function priorityFor(entry) {
  return [...entry.matchAll(/<(?:ke_pri|re_pri)>([^<]+)<\/(?:ke_pri|re_pri)>/g)]
    .map((match) => PRIORITY_WEIGHTS[match[1]] || 0)
    .reduce((best, score) => Math.max(best, score), 0);
}

const xml = await readGzip(sourcePath);

/**
 * Map a raw JMdict POS entity code to a canonical POS tag string.
 * Strips `&` and `;` delimiters before matching.
 *
 * @param {unknown} code - Raw POS code from a `<pos>` element (e.g. `"&n;"`, `"&v5u;"`).
 * @returns {"noun"|"verb"|"adjective"|"adverb"|""} Canonical POS string.
 */
function posForCode(code) {
  const clean = String(code || "").replaceAll("&", "").replaceAll(";", "");
  if (clean === "n" || clean.startsWith("n-")) return "noun";
  if (clean.startsWith("v")) return "verb";
  if (clean.startsWith("adj")) return "adjective";
  if (clean.startsWith("adv")) return "adverb";
  return "";
}

/**
 * Derive the primary canonical POS tag for a single JMdict `<sense>` block.
 * Returns the first non-empty POS code found.
 *
 * @param {string} sense - Raw XML text of one `<sense>` block.
 * @returns {"noun"|"verb"|"adjective"|"adverb"|""} Canonical POS string.
 */
function posForSense(sense) {
  const values = [...sense.matchAll(/<pos>([\s\S]*?)<\/pos>/g)]
    .map((match) => posForCode(match[1].trim()))
    .filter(Boolean);
  return values[0] || "";
}

/**
 * Parse all `<sense>` blocks from a JMdict entry into structured objects.
 *
 * @param {string} entry - Raw XML text of one `<entry>` block.
 * @returns {{ glosses: string[], pos: string }[]} Array of sense objects, each
 *   containing the list of English glosses and the primary POS tag.
 */
function senses(entry) {
  return [...entry.matchAll(/<sense>([\s\S]*?)<\/sense>/g)].map((match) => ({
    glosses: values(match[1], "gloss").filter(Boolean),
    pos: posForSense(match[1])
  }));
}

/**
 * Produce reverse-lookup English index keys from a list of gloss strings.
 * Only single lowercase words (matching `[a-z][a-z'-]{1,60}`) are indexed because
 * the English reader tokenises to individual words.
 *
 * @param {string[]} glosses - English gloss strings from one or more senses.
 * @returns {string[]} Unique indexable English tokens.
 */
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

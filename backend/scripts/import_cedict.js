/**
 * @file import_cedict.js
 * @description Builds an English-to-Chinese lookup index from the CC-CEDICT dictionary
 * (gzip-compressed UTF-8 text). Populates the `cedict_english_index` table, which is
 * cleared and rebuilt within a single transaction.
 *
 * Each CEDICT entry line has the form:
 * ```
 * traditional simplified [pinyin] /def1/def2/.../
 * ```
 * The importer extracts single-word English keys from each definition segment,
 * assigns a POS label heuristically (e.g. "to X" → verb), and stores one row per
 * (english_key, simplified) pair with the full definition text, pinyin, and priority.
 * Stop words and non-alpha-only tokens are excluded. Entries with 3 or fewer
 * definitions receive a small priority boost (they tend to be less ambiguous).
 *
 * CLI usage:
 * ```
 * node backend/scripts/import_cedict.js [gzPath]
 * ```
 * Optional first argument overrides the default path:
 * `<ROOT>/data/dictionaries/cedict_ts.u8.gz`.
 *
 * Exits with a JSON summary `{ entries, rows }` printed to stdout.
 * Requires `DATABASE_URL` (or equivalent db config) to be set in the environment.
 */
import { createGunzip } from "node:zlib";
import { createReadStream } from "node:fs";
import { join } from "node:path";
import { db, pool } from "../src/db/index.js";
import { ROOT } from "../src/config.js";

// Build the local English-to-Chinese lookup index from a gzipped CEDICT file.
const sourcePath = process.argv[2] || join(ROOT, "data", "dictionaries", "cedict_ts.u8.gz");
const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "to",
  "was",
  "were",
  "with"
]);

/**
 * Read and decompress a gzipped dictionary file.
 *
 * @param {string} path - Absolute path to a `.gz` file.
 * @returns {Promise<string>} Decompressed UTF-8 text content.
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
 * Heuristically infer a POS tag from a single CEDICT definition segment.
 * Definitions starting with "to " are treated as verbs; segments containing
 * explicit POS keywords are matched accordingly.
 *
 * @param {string} value - A single definition segment (one `/…/` field).
 * @returns {"verb"|"adjective"|"adverb"|"noun"|""} Inferred POS string.
 */
function posForDefinition(value) {
  const clean = value.toLowerCase();
  if (clean.startsWith("to ")) return "verb";
  if (/\b(adj|adjective)\b/.test(clean)) return "adjective";
  if (/\b(adv|adverb)\b/.test(clean)) return "adverb";
  if (/\b(noun|person|people|thing|place)\b/.test(clean)) return "noun";
  return "";
}

/**
 * Extract indexable English keys with priorities and POS tags from a CEDICT entry's
 * definition list. Only single lowercase words matching `[a-z][a-z'-]{1,80}` are
 * indexed; stop words are excluded. Verbs written as "to X" are indexed under the
 * bare verb form.
 *
 * @param {string[]} definitions - Array of definition segments for one CEDICT entry.
 * @returns {{ key: string, priority: number, pos: string }[]} Unique key objects;
 *   when the same key appears multiple times, the entry with the highest priority wins.
 */
function englishKeys(definitions) {
  // English reader tokens are single words, so only index single-word glosses.
  const keys = new Map();
  const addKey = (key, priority, pos) => {
    if (!/^[a-z][a-z'-]{1,80}$/.test(key)) return;
    if (STOP_WORDS.has(key)) return;
    const existing = keys.get(key);
    if (!existing || priority > existing.priority) {
      keys.set(key, { priority, pos });
    }
  };

  for (const definition of definitions) {
    for (const segment of definition.split(/[;,]/)) {
      const pos = posForDefinition(segment);
      const clean = segment
        .replace(/\([^)]*\)/g, "")
        .replace(/\b(CL|abbr|variant|see also|old variant|archaic)\b.*$/i, "")
        .trim()
        .toLowerCase();
      if (clean.startsWith("to ")) {
        addKey(clean.slice(3).trim(), 35, "verb");
      } else {
        addKey(clean, 40, pos);
      }
    }
  }
  return [...keys.entries()].map(([key, value]) => ({ key, priority: value.priority, pos: value.pos }));
}

const text = await readGzip(sourcePath);

let entries = 0;
let rows = 0;
try {
  await db.transaction(async (tx) => {
    const insert = tx.prepare(`
      INSERT INTO cedict_english_index (english, simplified, traditional, pinyin, definitions, pos, priority)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (english, simplified) DO UPDATE SET
        traditional = EXCLUDED.traditional,
        pinyin = EXCLUDED.pinyin,
        definitions = EXCLUDED.definitions,
        pos = EXCLUDED.pos,
        priority = EXCLUDED.priority
    `);
    // Rebuild the derived index from source data.
    await tx.prepare("DELETE FROM cedict_english_index").run();
    for (const line of text.split(/\r?\n/)) {
      if (!line || line.startsWith("#")) continue;
      const match = line.match(/^(\S+)\s+(\S+)\s+\[([^\]]+)\]\s+\/(.+)\/$/);
      if (!match) continue;
      entries += 1;
      const [, traditional, simplified, pinyin, rawDefinitions] = match;
      const definitions = rawDefinitions.split("/").map((entry) => entry.trim()).filter(Boolean);
      const definitionText = definitions.slice(0, 6).join("; ");
      const entryPriority = definitions.length <= 3 ? 1 : 0;
      for (const { key, priority, pos } of englishKeys(definitions)) {
        await insert.run(key, simplified, traditional, pinyin, definitionText, pos || null, priority + entryPriority);
        rows += 1;
      }
    }
  });
} finally {
  await pool.end();
}

console.log(JSON.stringify({ entries, rows }, null, 2));

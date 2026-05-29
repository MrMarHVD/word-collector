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

// Read and decompress a gzipped dictionary file.
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

// Produce English index keys with priorities from CEDICT definitions.
function posForDefinition(value) {
  const clean = value.toLowerCase();
  if (clean.startsWith("to ")) return "verb";
  if (/\b(adj|adjective)\b/.test(clean)) return "adjective";
  if (/\b(adv|adverb)\b/.test(clean)) return "adverb";
  if (/\b(noun|person|people|thing|place)\b/.test(clean)) return "noun";
  return "";
}

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

import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { DatabaseSync } from "node:sqlite";

const PORT = Number(process.env.PORT || 3000);
const ROOT = process.cwd();
const PUBLIC_DIR = join(ROOT, "public");
const DATA_DIR = join(ROOT, "data");
const DB_PATH = join(DATA_DIR, "words.db");

await mkdir(DATA_DIR, { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec(`
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS languages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

const collectionsTable = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'collections'").get();
if (!collectionsTable) {
  db.exec(`
    CREATE TABLE collections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      language_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (language_id) REFERENCES languages(id) ON DELETE RESTRICT,
      UNIQUE (language_id, name)
    );
  `);
} else {
  const collectionColumns = db.prepare("PRAGMA table_info(collections)").all();
  const hasLanguageId = collectionColumns.some((column) => column.name === "language_id");
  if (!hasLanguageId) {
    db.prepare("INSERT OR IGNORE INTO languages (name) VALUES (?)").run("未分類");
    const defaultLanguage = db.prepare("SELECT id FROM languages WHERE name = ?").get("未分類");
    db.exec("PRAGMA foreign_keys = OFF");
    db.exec("BEGIN");
    try {
      db.exec(`
        CREATE TABLE collections_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          language_id INTEGER NOT NULL,
          name TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (language_id) REFERENCES languages(id) ON DELETE RESTRICT,
          UNIQUE (language_id, name)
        );
      `);
      db.prepare(`
        INSERT INTO collections_new (id, language_id, name, created_at)
        SELECT id, ?, name, created_at FROM collections
      `).run(defaultLanguage.id);
      db.exec("DROP TABLE collections");
      db.exec("ALTER TABLE collections_new RENAME TO collections");
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    } finally {
      db.exec("PRAGMA foreign_keys = ON");
    }
  }
}

db.exec(`
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS words (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    collection_id INTEGER NOT NULL,
    word TEXT NOT NULL,
    translation TEXT NOT NULL,
    known INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE,
    UNIQUE (collection_id, word, translation)
  );
`);

const statements = {
  languageById: db.prepare("SELECT id, name FROM languages WHERE id = ?"),
  languageByName: db.prepare("SELECT id, name FROM languages WHERE lower(name) = lower(?)"),
  createLanguage: db.prepare("INSERT INTO languages (name) VALUES (?)"),
  collectionByName: db.prepare(`
    SELECT c.id, c.name, c.language_id AS languageId, l.name AS languageName
    FROM collections c
    JOIN languages l ON l.id = c.language_id
    WHERE c.language_id = ? AND lower(c.name) = lower(?)
  `),
  collectionById: db.prepare(`
    SELECT c.id, c.name, c.language_id AS languageId, l.name AS languageName
    FROM collections c
    JOIN languages l ON l.id = c.language_id
    WHERE c.id = ?
  `),
  createCollection: db.prepare("INSERT INTO collections (language_id, name) VALUES (?, ?)"),
  deleteCollection: db.prepare("DELETE FROM collections WHERE id = ?"),
  updateCollectionLanguage: db.prepare("UPDATE collections SET language_id = ? WHERE id = ?"),
  insertWord: db.prepare(`
    INSERT INTO words (collection_id, word, translation)
    VALUES (?, ?, ?)
    ON CONFLICT(collection_id, word, translation) DO NOTHING
  `),
  updateKnown: db.prepare("UPDATE words SET known = ? WHERE id = ?"),
  wordById: db.prepare("SELECT id, collection_id AS collectionId, word, translation, known FROM words WHERE id = ?")
};

function jsonResponse(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body)
  });
  res.end(body);
}

function textResponse(res, status, body) {
  res.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  res.end(body);
}

async function readJson(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 2_000_000) {
      throw new Error("Request body is too large.");
    }
  }
  return raw ? JSON.parse(raw) : {};
}

function normalizeName(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function getLanguages() {
  return db.prepare(`
    SELECT id, name
    FROM languages
    ORDER BY lower(name)
  `).all();
}

function getDashboard(languageId) {
  const selectedLanguageId = Number(languageId) || null;
  const filter = selectedLanguageId ? "WHERE c.language_id = ?" : "";
  const params = selectedLanguageId ? [selectedLanguageId] : [];

  const totals = db.prepare(`
    SELECT
      COUNT(w.id) AS totalWords,
      COALESCE(SUM(w.known), 0) AS knownWords
    FROM collections c
    LEFT JOIN words w ON w.collection_id = c.id
    ${filter}
  `).get(...params);

  const collections = db.prepare(`
    SELECT
      c.id,
      c.name,
      c.language_id AS languageId,
      l.name AS languageName,
      COUNT(w.id) AS totalWords,
      COALESCE(SUM(w.known), 0) AS knownWords
    FROM collections c
    JOIN languages l ON l.id = c.language_id
    LEFT JOIN words w ON w.collection_id = c.id
    ${filter}
    GROUP BY c.id
    ORDER BY lower(l.name), lower(c.name)
  `).all(...params);

  const allCollections = db.prepare(`
    SELECT
      c.id,
      c.name,
      c.language_id AS languageId,
      l.name AS languageName,
      COUNT(w.id) AS totalWords,
      COALESCE(SUM(w.known), 0) AS knownWords
    FROM collections c
    JOIN languages l ON l.id = c.language_id
    LEFT JOIN words w ON w.collection_id = c.id
    GROUP BY c.id
    ORDER BY lower(l.name), lower(c.name)
  `).all();

  return {
    languages: getLanguages(),
    selectedLanguageId,
    totalWords: Number(totals.totalWords || 0),
    knownWords: Number(totals.knownWords || 0),
    collections: collections.map((collection) => ({
      ...collection,
      totalWords: Number(collection.totalWords || 0),
      knownWords: Number(collection.knownWords || 0),
      unknownWords: Number(collection.totalWords || 0) - Number(collection.knownWords || 0)
    })),
    allCollections: allCollections.map((collection) => ({
      ...collection,
      totalWords: Number(collection.totalWords || 0),
      knownWords: Number(collection.knownWords || 0),
      unknownWords: Number(collection.totalWords || 0) - Number(collection.knownWords || 0)
    }))
  };
}

function getOrCreateLanguage(languageName, languageId) {
  const id = Number(languageId) || null;
  if (id) {
    return statements.languageById.get(id);
  }

  const name = normalizeName(languageName);
  if (!name) {
    return null;
  }

  let language = statements.languageByName.get(name);
  if (!language) {
    statements.createLanguage.run(name);
    language = statements.languageByName.get(name);
  }
  return language;
}

function getWords(collectionId, search) {
  const term = normalizeName(search);
  if (term) {
    return db.prepare(`
      SELECT id, collection_id AS collectionId, word, translation, known
      FROM words
      WHERE collection_id = ?
        AND (lower(word) LIKE lower(?) OR lower(translation) LIKE lower(?))
      ORDER BY lower(word), lower(translation)
    `).all(collectionId, `%${term}%`, `%${term}%`);
  }

  return db.prepare(`
    SELECT id, collection_id AS collectionId, word, translation, known
    FROM words
    WHERE collection_id = ?
    ORDER BY lower(word), lower(translation)
  `).all(collectionId);
}

function importWords(collectionName, languageName, languageId, words) {
  const name = normalizeName(collectionName);
  if (!name) {
    return { error: "Collection name is required." };
  }

  const language = getOrCreateLanguage(languageName, languageId);
  if (!language) {
    return { error: "Language is required." };
  }

  const cleanWords = Array.isArray(words)
    ? words
        .map((entry) => ({
          word: normalizeName(entry?.word),
          translation: normalizeName(entry?.translation)
        }))
        .filter((entry) => entry.word && entry.translation)
    : [];

  if (!cleanWords.length) {
    return { error: "Upload at least one row with a word and translation." };
  }

  let collection = statements.collectionByName.get(language.id, name);
  if (!collection) {
    statements.createCollection.run(language.id, name);
    collection = statements.collectionByName.get(language.id, name);
  }

  let inserted = 0;
  db.exec("BEGIN");
  try {
    for (const row of cleanWords) {
      const result = statements.insertWord.run(collection.id, row.word, row.translation);
      inserted += result.changes;
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return {
    collection,
    parsed: cleanWords.length,
    inserted,
    skipped: cleanWords.length - inserted
  };
}

async function handleApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/dashboard") {
    return jsonResponse(res, 200, getDashboard(url.searchParams.get("languageId")));
  }

  if (req.method === "GET" && url.pathname === "/api/languages") {
    return jsonResponse(res, 200, { languages: getLanguages() });
  }

  const wordsMatch = url.pathname.match(/^\/api\/collections\/(\d+)\/words$/);
  if (req.method === "GET" && wordsMatch) {
    const collectionId = Number(wordsMatch[1]);
    const collection = statements.collectionById.get(collectionId);
    if (!collection) {
      return jsonResponse(res, 404, { error: "Collection not found." });
    }
    return jsonResponse(res, 200, {
      collection,
      words: getWords(collectionId, url.searchParams.get("search") || "")
    });
  }

  const collectionMatch = url.pathname.match(/^\/api\/collections\/(\d+)$/);
  if (req.method === "PATCH" && collectionMatch) {
    const collectionId = Number(collectionMatch[1]);
    const body = await readJson(req);
    const language = getOrCreateLanguage(body.languageName, body.languageId);
    if (!language) {
      return jsonResponse(res, 400, { error: "Language is required." });
    }
    const collection = statements.collectionById.get(collectionId);
    if (!collection) {
      return jsonResponse(res, 404, { error: "Collection not found." });
    }
    try {
      statements.updateCollectionLanguage.run(language.id, collectionId);
    } catch (error) {
      return jsonResponse(res, 409, { error: "A collection with this name already exists in that language." });
    }
    return jsonResponse(res, 200, statements.collectionById.get(collectionId));
  }

  if (req.method === "DELETE" && collectionMatch) {
    const collectionId = Number(collectionMatch[1]);
    const result = statements.deleteCollection.run(collectionId);
    if (!result.changes) {
      return jsonResponse(res, 404, { error: "Collection not found." });
    }
    return jsonResponse(res, 200, { deleted: true, id: collectionId });
  }

  if (req.method === "POST" && url.pathname === "/api/import") {
    const body = await readJson(req);
    const result = importWords(body.collectionName, body.languageName, body.languageId, body.words);
    if (result.error) {
      return jsonResponse(res, 400, result);
    }
    return jsonResponse(res, 201, result);
  }

  const knownMatch = url.pathname.match(/^\/api\/words\/(\d+)$/);
  if (req.method === "PATCH" && knownMatch) {
    const id = Number(knownMatch[1]);
    const body = await readJson(req);
    const known = body.known ? 1 : 0;
    const result = statements.updateKnown.run(known, id);
    if (!result.changes) {
      return jsonResponse(res, 404, { error: "Word not found." });
    }
    return jsonResponse(res, 200, statements.wordById.get(id));
  }

  return jsonResponse(res, 404, { error: "Not found." });
}

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

async function serveStatic(req, res, url) {
  const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = normalize(join(PUBLIC_DIR, requestedPath));

  if (!filePath.startsWith(PUBLIC_DIR) || !existsSync(filePath)) {
    return textResponse(res, 404, "Not found");
  }

  const content = await readFile(filePath);
  res.writeHead(200, {
    "content-type": mimeTypes[extname(filePath)] || "application/octet-stream"
  });
  res.end(content);
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }
    await serveStatic(req, res, url);
  } catch (error) {
    jsonResponse(res, 500, { error: error.message || "Internal server error." });
  }
}).listen(PORT, () => {
  console.log(`Word Marker running at http://localhost:${PORT}`);
});

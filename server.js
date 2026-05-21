import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { createHmac, pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

const PORT = Number(process.env.PORT || 3000);
const ROOT = process.cwd();
const PUBLIC_DIR = join(ROOT, "public");
const DATA_DIR = join(ROOT, "data");
const DB_PATH = join(DATA_DIR, "words.db");
const JWT_SECRET_PATH = join(DATA_DIR, "jwt.secret");
const AUTH_COOKIE = "word_collector_token";
const JWT_TTL_SECONDS = 7 * 24 * 60 * 60;
const SEED_EMAIL = "havardjvd@gmail.com";
const SEED_PASSWORD = "MelkeMannen22";

await mkdir(DATA_DIR, { recursive: true });

async function getJwtSecret() {
  if (existsSync(JWT_SECRET_PATH)) {
    return (await readFile(JWT_SECRET_PATH, "utf8")).trim();
  }
  const secret = randomBytes(48).toString("base64url");
  await writeFile(JWT_SECRET_PATH, `${secret}\n`, { mode: 0o600 });
  return secret;
}

const JWT_SECRET = await getJwtSecret();

const db = new DatabaseSync(DB_PATH);

function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  const hash = pbkdf2Sync(password, salt, 120_000, 32, "sha256").toString("hex");
  return { salt, hash };
}

function verifyPassword(password, salt, expectedHash) {
  const actual = pbkdf2Sync(password, salt, 120_000, 32, "sha256");
  const expected = Buffer.from(expectedHash, "hex");
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}

function base64UrlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function signJwt(header, payload) {
  const data = `${base64UrlJson(header)}.${base64UrlJson(payload)}`;
  const signature = createHmac("sha256", JWT_SECRET).update(data).digest("base64url");
  return `${data}.${signature}`;
}

function createJwt(user) {
  const now = Math.floor(Date.now() / 1000);
  return signJwt(
    { alg: "HS256", typ: "JWT" },
    {
      sub: String(user.id),
      email: user.email,
      iat: now,
      exp: now + JWT_TTL_SECONDS,
      jti: randomBytes(16).toString("hex")
    }
  );
}

function verifyJwt(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) {
    return null;
  }

  const [encodedHeader, encodedPayload, signature] = parts;
  const data = `${encodedHeader}.${encodedPayload}`;
  const expected = createHmac("sha256", JWT_SECRET).update(data).digest("base64url");
  const actual = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actual.length !== expectedBuffer.length || !timingSafeEqual(actual, expectedBuffer)) {
    return null;
  }

  try {
    const header = JSON.parse(Buffer.from(encodedHeader, "base64url").toString("utf8"));
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
    const now = Math.floor(Date.now() / 1000);
    if (header.alg !== "HS256" || header.typ !== "JWT" || !payload.sub || !payload.exp || payload.exp <= now) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

db.exec(`
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS predefined_languages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

function ensureSeedUser() {
  let user = db.prepare("SELECT id, email FROM users WHERE lower(email) = lower(?)").get(SEED_EMAIL);
  if (!user) {
    const password = hashPassword(SEED_PASSWORD);
    db.prepare("INSERT INTO users (email, password_hash, password_salt) VALUES (?, ?, ?)").run(SEED_EMAIL, password.hash, password.salt);
    user = db.prepare("SELECT id, email FROM users WHERE lower(email) = lower(?)").get(SEED_EMAIL);
  }
  return user;
}

const seedUser = ensureSeedUser();
db.prepare("INSERT OR IGNORE INTO predefined_languages (name) VALUES (?)").run("English");

db.exec(`
  CREATE TABLE IF NOT EXISTS languages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    name TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

const languageColumns = db.prepare("PRAGMA table_info(languages)").all();
const hasLanguageUserId = languageColumns.some((column) => column.name === "user_id");
const languageUserIdNotNull = languageColumns.find((column) => column.name === "user_id")?.notnull === 1;
if (!hasLanguageUserId || !languageUserIdNotNull) {
  db.exec("PRAGMA foreign_keys = OFF");
  db.exec("BEGIN");
  try {
    db.exec(`
      CREATE TABLE languages_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE (user_id, name)
      );
    `);
    db.prepare(`
      INSERT INTO languages_new (id, user_id, name, created_at)
      SELECT id, ?, name, created_at FROM languages
    `).run(seedUser.id);
    db.exec("DROP TABLE languages");
    db.exec("ALTER TABLE languages_new RENAME TO languages");
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  } finally {
    db.exec("PRAGMA foreign_keys = ON");
  }
}

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

  CREATE TABLE IF NOT EXISTS user_word_status (
    user_id INTEGER NOT NULL,
    word_id INTEGER NOT NULL,
    known INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, word_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (word_id) REFERENCES words(id) ON DELETE CASCADE
  );
`);

db.prepare(`
  INSERT OR IGNORE INTO user_word_status (user_id, word_id, known)
  SELECT ?, id, known FROM words WHERE known = 1
`).run(seedUser.id);

const statements = {
  userByEmail: db.prepare("SELECT id, email, password_hash AS passwordHash, password_salt AS passwordSalt FROM users WHERE lower(email) = lower(?)"),
  userById: db.prepare("SELECT id, email FROM users WHERE id = ?"),
  createUser: db.prepare("INSERT INTO users (email, password_hash, password_salt) VALUES (?, ?, ?)"),
  predefinedLanguages: db.prepare("SELECT id, name FROM predefined_languages ORDER BY lower(name)"),
  predefinedLanguageById: db.prepare("SELECT id, name FROM predefined_languages WHERE id = ?"),
  languageById: db.prepare("SELECT id, user_id AS userId, name FROM languages WHERE id = ? AND user_id = ?"),
  languageByName: db.prepare("SELECT id, user_id AS userId, name FROM languages WHERE user_id = ? AND lower(name) = lower(?)"),
  createLanguage: db.prepare("INSERT INTO languages (user_id, name) VALUES (?, ?)"),
  collectionByName: db.prepare(`
    SELECT c.id, c.name, c.language_id AS languageId, l.name AS languageName
    FROM collections c
    JOIN languages l ON l.id = c.language_id
    WHERE l.user_id = ? AND c.language_id = ? AND lower(c.name) = lower(?)
  `),
  collectionById: db.prepare(`
    SELECT c.id, c.name, c.language_id AS languageId, l.name AS languageName
    FROM collections c
    JOIN languages l ON l.id = c.language_id
    WHERE c.id = ? AND l.user_id = ?
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
  upsertKnown: db.prepare(`
    INSERT INTO user_word_status (user_id, word_id, known, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id, word_id) DO UPDATE SET known = excluded.known, updated_at = CURRENT_TIMESTAMP
  `),
  wordById: db.prepare(`
    SELECT w.id, w.collection_id AS collectionId, w.word, w.translation, COALESCE(uws.known, 0) AS known
    FROM words w
    JOIN collections c ON c.id = w.collection_id
    JOIN languages l ON l.id = c.language_id
    LEFT JOIN user_word_status uws ON uws.word_id = w.id AND uws.user_id = ?
    WHERE w.id = ? AND l.user_id = ?
  `)
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

function parseCookies(req) {
  return Object.fromEntries(
    String(req.headers.cookie || "")
      .split(";")
      .map((cookie) => cookie.trim())
      .filter(Boolean)
      .map((cookie) => {
        const index = cookie.indexOf("=");
        return [decodeURIComponent(cookie.slice(0, index)), decodeURIComponent(cookie.slice(index + 1))];
      })
  );
}

function setAuthCookie(res, token) {
  res.setHeader("set-cookie", `${AUTH_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${JWT_TTL_SECONDS}`);
}

function clearAuthCookie(res) {
  res.setHeader("set-cookie", `${AUTH_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

function getAuthenticatedUser(req) {
  const token = parseCookies(req)[AUTH_COOKIE];
  const payload = verifyJwt(token);
  if (!payload) {
    return null;
  }
  const user = statements.userById.get(Number(payload.sub));
  if (!user || user.email !== payload.email) {
    return null;
  }
  return { userId: user.id, email: user.email };
}

function requireUser(req, res) {
  const user = getAuthenticatedUser(req);
  if (!user) {
    jsonResponse(res, 401, { error: "Authentication required." });
    return null;
  }
  return user;
}

function setJwtForUser(res, user) {
  setAuthCookie(res, createJwt(user));
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

function getLanguages(userId) {
  return db.prepare(`
    SELECT id, name
    FROM languages
    WHERE user_id = ?
    ORDER BY lower(name)
  `).all(userId);
}

function getDashboard(userId, languageId) {
  const selectedLanguageId = Number(languageId) || null;
  const filter = selectedLanguageId ? "WHERE l.user_id = ? AND c.language_id = ?" : "WHERE l.user_id = ?";
  const params = selectedLanguageId ? [userId, selectedLanguageId] : [userId];

  const totals = db.prepare(`
    SELECT
      COUNT(w.id) AS totalWords,
      COALESCE(SUM(CASE WHEN uws.known = 1 THEN 1 ELSE 0 END), 0) AS knownWords
    FROM collections c
    JOIN languages l ON l.id = c.language_id
    LEFT JOIN words w ON w.collection_id = c.id
    LEFT JOIN user_word_status uws ON uws.word_id = w.id AND uws.user_id = ?
    ${filter}
  `).get(userId, ...params);

  const collections = db.prepare(`
    SELECT
      c.id,
      c.name,
      c.language_id AS languageId,
      l.name AS languageName,
      COUNT(w.id) AS totalWords,
      COALESCE(SUM(CASE WHEN uws.known = 1 THEN 1 ELSE 0 END), 0) AS knownWords
    FROM collections c
    JOIN languages l ON l.id = c.language_id
    LEFT JOIN words w ON w.collection_id = c.id
    LEFT JOIN user_word_status uws ON uws.word_id = w.id AND uws.user_id = ?
    ${filter}
    GROUP BY c.id
    ORDER BY lower(l.name), lower(c.name)
  `).all(userId, ...params);

  const allCollections = db.prepare(`
    SELECT
      c.id,
      c.name,
      c.language_id AS languageId,
      l.name AS languageName,
      COUNT(w.id) AS totalWords,
      COALESCE(SUM(CASE WHEN uws.known = 1 THEN 1 ELSE 0 END), 0) AS knownWords
    FROM collections c
    JOIN languages l ON l.id = c.language_id
    LEFT JOIN words w ON w.collection_id = c.id
    LEFT JOIN user_word_status uws ON uws.word_id = w.id AND uws.user_id = ?
    WHERE l.user_id = ?
    GROUP BY c.id
    ORDER BY lower(l.name), lower(c.name)
  `).all(userId, userId);

  return {
    languages: getLanguages(userId),
    predefinedLanguages: statements.predefinedLanguages.all(),
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

function getOrCreateLanguage(userId, languageName, languageId) {
  const id = Number(languageId) || null;
  if (id) {
    return statements.languageById.get(id, userId);
  }

  const name = normalizeName(languageName);
  if (!name) {
    return null;
  }

  let language = statements.languageByName.get(userId, name);
  if (!language) {
    statements.createLanguage.run(userId, name);
    language = statements.languageByName.get(userId, name);
  }
  return language;
}

function getWords(userId, collectionId, search) {
  const term = normalizeName(search);
  if (term) {
    return db.prepare(`
      SELECT w.id, w.collection_id AS collectionId, w.word, w.translation, COALESCE(uws.known, 0) AS known
      FROM words w
      JOIN collections c ON c.id = w.collection_id
      JOIN languages l ON l.id = c.language_id
      LEFT JOIN user_word_status uws ON uws.word_id = w.id AND uws.user_id = ?
      WHERE l.user_id = ? AND w.collection_id = ?
        AND (lower(w.word) LIKE lower(?) OR lower(w.translation) LIKE lower(?))
      ORDER BY lower(w.word), lower(w.translation)
    `).all(userId, userId, collectionId, `%${term}%`, `%${term}%`);
  }

  return db.prepare(`
    SELECT w.id, w.collection_id AS collectionId, w.word, w.translation, COALESCE(uws.known, 0) AS known
    FROM words w
    JOIN collections c ON c.id = w.collection_id
    JOIN languages l ON l.id = c.language_id
    LEFT JOIN user_word_status uws ON uws.word_id = w.id AND uws.user_id = ?
    WHERE l.user_id = ? AND w.collection_id = ?
    ORDER BY lower(w.word), lower(w.translation)
  `).all(userId, userId, collectionId);
}

function importWords(userId, collectionName, languageName, languageId, words) {
  const name = normalizeName(collectionName);
  if (!name) {
    return { error: "Collection name is required." };
  }

  const language = getOrCreateLanguage(userId, languageName, languageId);
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

  let collection = statements.collectionByName.get(userId, language.id, name);
  if (!collection) {
    statements.createCollection.run(language.id, name);
    collection = statements.collectionByName.get(userId, language.id, name);
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
  if (req.method === "GET" && url.pathname === "/api/auth/me") {
    const user = getAuthenticatedUser(req);
    if (!user) {
      return jsonResponse(res, 200, { user: null, languages: [], predefinedLanguages: statements.predefinedLanguages.all() });
    }
    const languages = getLanguages(user.userId);
    return jsonResponse(res, 200, {
      user: { id: user.userId, email: user.email },
      languages,
      predefinedLanguages: statements.predefinedLanguages.all(),
      needsOnboarding: languages.length === 0
    });
  }

  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    const body = await readJson(req);
    const email = normalizeName(body.email).toLowerCase();
    const user = statements.userByEmail.get(email);
    if (!user || !verifyPassword(String(body.password || ""), user.passwordSalt, user.passwordHash)) {
      return jsonResponse(res, 401, { error: "Invalid email or password." });
    }
    setJwtForUser(res, user);
    return jsonResponse(res, 200, { user: { id: user.id, email: user.email } });
  }

  if (req.method === "POST" && url.pathname === "/api/auth/register") {
    const body = await readJson(req);
    const email = normalizeName(body.email).toLowerCase();
    const password = String(body.password || "");
    const confirmPassword = String(body.confirmPassword || "");
    if (!email || !password || password !== confirmPassword) {
      return jsonResponse(res, 400, { error: "Email, password, and matching confirmation are required." });
    }
    if (statements.userByEmail.get(email)) {
      return jsonResponse(res, 409, { error: "User already exists." });
    }
    const passwordHash = hashPassword(password);
    statements.createUser.run(email, passwordHash.hash, passwordHash.salt);
    const user = statements.userByEmail.get(email);
    setJwtForUser(res, user);
    return jsonResponse(res, 201, { user: { id: user.id, email: user.email } });
  }

  if (req.method === "POST" && url.pathname === "/api/auth/logout") {
    clearAuthCookie(res);
    return jsonResponse(res, 200, { loggedOut: true });
  }

  const user = requireUser(req, res);
  if (!user) {
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/user/languages") {
    const body = await readJson(req);
    const predefined = statements.predefinedLanguageById.get(Number(body.predefinedLanguageId));
    if (!predefined) {
      return jsonResponse(res, 404, { error: "Predefined language not found." });
    }
    const language = getOrCreateLanguage(user.userId, predefined.name, null);
    return jsonResponse(res, 201, { language, languages: getLanguages(user.userId) });
  }

  if (req.method === "GET" && url.pathname === "/api/dashboard") {
    return jsonResponse(res, 200, getDashboard(user.userId, url.searchParams.get("languageId")));
  }

  if (req.method === "GET" && url.pathname === "/api/languages") {
    return jsonResponse(res, 200, { languages: getLanguages(user.userId), predefinedLanguages: statements.predefinedLanguages.all() });
  }

  const wordsMatch = url.pathname.match(/^\/api\/collections\/(\d+)\/words$/);
  if (req.method === "GET" && wordsMatch) {
    const collectionId = Number(wordsMatch[1]);
    const collection = statements.collectionById.get(collectionId, user.userId);
    if (!collection) {
      return jsonResponse(res, 404, { error: "Collection not found." });
    }
    return jsonResponse(res, 200, {
      collection,
      words: getWords(user.userId, collectionId, url.searchParams.get("search") || "")
    });
  }

  const collectionMatch = url.pathname.match(/^\/api\/collections\/(\d+)$/);
  if (req.method === "PATCH" && collectionMatch) {
    const collectionId = Number(collectionMatch[1]);
    const body = await readJson(req);
    const language = getOrCreateLanguage(user.userId, body.languageName, body.languageId);
    if (!language) {
      return jsonResponse(res, 400, { error: "Language is required." });
    }
    const collection = statements.collectionById.get(collectionId, user.userId);
    if (!collection) {
      return jsonResponse(res, 404, { error: "Collection not found." });
    }
    try {
      statements.updateCollectionLanguage.run(language.id, collectionId);
    } catch (error) {
      return jsonResponse(res, 409, { error: "A collection with this name already exists in that language." });
    }
    return jsonResponse(res, 200, statements.collectionById.get(collectionId, user.userId));
  }

  if (req.method === "DELETE" && collectionMatch) {
    const collectionId = Number(collectionMatch[1]);
    if (!statements.collectionById.get(collectionId, user.userId)) {
      return jsonResponse(res, 404, { error: "Collection not found." });
    }
    const result = statements.deleteCollection.run(collectionId);
    if (!result.changes) {
      return jsonResponse(res, 404, { error: "Collection not found." });
    }
    return jsonResponse(res, 200, { deleted: true, id: collectionId });
  }

  if (req.method === "POST" && url.pathname === "/api/import") {
    const body = await readJson(req);
    const result = importWords(user.userId, body.collectionName, body.languageName, body.languageId, body.words);
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
    const existingWord = statements.wordById.get(user.userId, id, user.userId);
    if (!existingWord) {
      return jsonResponse(res, 404, { error: "Word not found." });
    }
    statements.upsertKnown.run(user.userId, id, known);
    return jsonResponse(res, 200, statements.wordById.get(user.userId, id, user.userId));
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

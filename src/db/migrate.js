import { SEED_EMAIL, SEED_PASSWORD, STUDY_LANGUAGE_OPTIONS } from "../config.js";
import { hashPassword } from "../auth/password.js";

// Migrations are additive where possible and preserve legacy rows when a table
// must be rebuilt to add ownership or constraints.
// Ensure the configured seed user exists for legacy data ownership.
function ensureSeedUser(db) {
  let user = db.prepare("SELECT id, email FROM users WHERE lower(email) = lower(?)").get(SEED_EMAIL);
  if (!user) {
    const password = hashPassword(SEED_PASSWORD);
    db.prepare("INSERT INTO users (email, password_hash, password_salt) VALUES (?, ?, ?)").run(SEED_EMAIL, password.hash, password.salt);
    user = db.prepare("SELECT id, email FROM users WHERE lower(email) = lower(?)").get(SEED_EMAIL);
  }
  return user;
}

// Create and migrate all application tables and derived indexes.
export function runMigrations(db) {
  // Identity tables come first because later migrations assign existing data to
  // users and enforce per-user ownership.
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

  const userColumns = db.prepare("PRAGMA table_info(users)").all();
  if (!userColumns.some((column) => column.name === "native_language")) {
    db.exec("ALTER TABLE users ADD COLUMN native_language TEXT NOT NULL DEFAULT 'English'");
  }

  const seedUser = ensureSeedUser(db);
  const insertPredefinedLanguage = db.prepare("INSERT OR IGNORE INTO predefined_languages (name) VALUES (?)");
  for (const language of STUDY_LANGUAGE_OPTIONS) {
    insertPredefinedLanguage.run(language);
  }

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
    // Older databases used global languages. Assign them to the seed user while
    // rebuilding the table with required user ownership.
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

  const insertUserLanguage = db.prepare("INSERT OR IGNORE INTO languages (user_id, name) VALUES (?, ?)");
  const users = db.prepare("SELECT id FROM users").all();
  for (const user of users) {
    for (const language of STUDY_LANGUAGE_OPTIONS) {
      insertUserLanguage.run(user.id, language);
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
      // Legacy collections without a language are kept under a default bucket.
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

  const wordColumns = db.prepare("PRAGMA table_info(words)").all();
  if (!wordColumns.some((column) => column.name === "lemma")) {
    db.exec("ALTER TABLE words ADD COLUMN lemma TEXT");
    db.exec("UPDATE words SET lemma = word WHERE lemma IS NULL OR trim(lemma) = ''");
  }
  if (!wordColumns.some((column) => column.name === "pos")) {
    db.exec("ALTER TABLE words ADD COLUMN pos TEXT");
  }
  if (!wordColumns.some((column) => column.name === "pos_subcategory")) {
    db.exec("ALTER TABLE words ADD COLUMN pos_subcategory TEXT");
  }
  if (!wordColumns.some((column) => column.name === "reading")) {
    db.exec("ALTER TABLE words ADD COLUMN reading TEXT");
  }
  if (!wordColumns.some((column) => column.name === "pinyin")) {
    db.exec("ALTER TABLE words ADD COLUMN pinyin TEXT");
  }
  if (!wordColumns.some((column) => column.name === "traditional")) {
    db.exec("ALTER TABLE words ADD COLUMN traditional TEXT");
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS word_translations (
      word_id INTEGER NOT NULL,
      native_language TEXT NOT NULL,
      translation TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (word_id, native_language),
      FOREIGN KEY (word_id) REFERENCES words(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS materials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      language_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_type TEXT NOT NULL,
      raw_text TEXT NOT NULL,
      word_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (language_id) REFERENCES languages(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS material_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      material_id INTEGER NOT NULL,
      position INTEGER NOT NULL,
      surface TEXT NOT NULL,
      normalized TEXT NOT NULL,
      lemma TEXT NOT NULL,
      pos TEXT,
      word_id INTEGER NOT NULL,
      paragraph_index INTEGER NOT NULL DEFAULT 0,
      sentence_index INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE,
      FOREIGN KEY (word_id) REFERENCES words(id) ON DELETE CASCADE,
      UNIQUE (material_id, position)
    );

    CREATE INDEX IF NOT EXISTS idx_materials_user_language ON materials(user_id, language_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_material_tokens_material_position ON material_tokens(material_id, position);
    CREATE INDEX IF NOT EXISTS idx_material_tokens_word ON material_tokens(word_id);
    CREATE INDEX IF NOT EXISTS idx_words_collection_lemma ON words(collection_id, lemma);

    CREATE TABLE IF NOT EXISTS jmdict_entries (
      expression TEXT NOT NULL,
      reading TEXT,
      gloss TEXT NOT NULL,
      priority INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (expression, gloss)
    );

    CREATE INDEX IF NOT EXISTS idx_jmdict_expression ON jmdict_entries(expression);
    CREATE INDEX IF NOT EXISTS idx_jmdict_reading ON jmdict_entries(reading);

    CREATE TABLE IF NOT EXISTS jmdict_english_index (
      english TEXT NOT NULL,
      expression TEXT NOT NULL,
      gloss TEXT NOT NULL,
      priority INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (english, expression)
    );

    CREATE INDEX IF NOT EXISTS idx_jmdict_english ON jmdict_english_index(english);

    CREATE TABLE IF NOT EXISTS cedict_english_index (
      english TEXT NOT NULL,
      simplified TEXT NOT NULL,
      traditional TEXT NOT NULL,
      pinyin TEXT NOT NULL,
      definitions TEXT NOT NULL,
      priority INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (english, simplified)
    );

    CREATE INDEX IF NOT EXISTS idx_cedict_english ON cedict_english_index(english);
    CREATE INDEX IF NOT EXISTS idx_cedict_simplified ON cedict_english_index(simplified);
    CREATE INDEX IF NOT EXISTS idx_cedict_traditional ON cedict_english_index(traditional);
  `);

  const materialColumns = db.prepare("PRAGMA table_info(materials)").all();
  if (!materialColumns.some((column) => column.name === "reader_start")) {
    db.exec("ALTER TABLE materials ADD COLUMN reader_start INTEGER NOT NULL DEFAULT 0");
  }

  const materialTokenColumns = db.prepare("PRAGMA table_info(material_tokens)").all();
  if (!materialTokenColumns.some((column) => column.name === "conjugation_form")) {
    db.exec("ALTER TABLE material_tokens ADD COLUMN conjugation_form TEXT");
  }
  if (!materialTokenColumns.some((column) => column.name === "block_index")) {
    db.exec("ALTER TABLE material_tokens ADD COLUMN block_index INTEGER");
  }
  if (!materialTokenColumns.some((column) => column.name === "block_type")) {
    db.exec("ALTER TABLE material_tokens ADD COLUMN block_type TEXT");
  }

  // Rewrite pre-i18n human strings to stable kebab-case keys so the UI can localize them.
  db.prepare("UPDATE words SET pos_subcategory = 'ichidan-verb' WHERE pos_subcategory = 'ichidan verb'").run();
  db.prepare("UPDATE words SET pos_subcategory = 'suru-verb' WHERE pos_subcategory = 'suru verb'").run();
  db.prepare("UPDATE words SET pos_subcategory = 'kuru-verb' WHERE pos_subcategory = 'kuru verb'").run();
  db.prepare("UPDATE words SET pos_subcategory = 'godan-verb' WHERE pos_subcategory LIKE 'godan verb%'").run();
  db.prepare("UPDATE material_tokens SET conjugation_form = 'past-stem' WHERE conjugation_form = 'past stem'").run();
  db.prepare("UPDATE material_tokens SET conjugation_form = 'negative-stem' WHERE conjugation_form = 'negative stem'").run();
  db.prepare("UPDATE material_tokens SET conjugation_form = 'volitional-stem' WHERE conjugation_form = 'volitional stem'").run();

  db.prepare(`
    INSERT OR IGNORE INTO word_translations (word_id, native_language, translation)
    SELECT id, 'English', translation FROM words
  `).run();

  db.prepare(`
    INSERT OR IGNORE INTO user_word_status (user_id, word_id, known)
    SELECT ?, id, known FROM words WHERE known = 1
  `).run(seedUser.id);
}

// Baseline schema, translated from the original node:sqlite migrations to
// Postgres. Subsequent schema changes should be added as new migration files
// rather than edited into this one.

export const up = (pgm) => {
  pgm.sql(`
    CREATE TABLE users (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      native_language TEXT NOT NULL DEFAULT 'English',
      practice_words_per_session INTEGER NOT NULL DEFAULT 20
    );

    CREATE TABLE sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE predefined_languages (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE languages (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (user_id, name)
    );

    CREATE TABLE collections (
      id SERIAL PRIMARY KEY,
      language_id INTEGER NOT NULL REFERENCES languages(id) ON DELETE RESTRICT,
      name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (language_id, name)
    );

    CREATE TABLE words (
      id SERIAL PRIMARY KEY,
      collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
      word TEXT NOT NULL,
      translation TEXT NOT NULL,
      known INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      lemma TEXT,
      pos TEXT,
      pos_subcategory TEXT,
      reading TEXT,
      pinyin TEXT,
      traditional TEXT,
      UNIQUE (collection_id, word, translation)
    );

    CREATE TABLE user_word_status (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      word_id INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
      known INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'unknown',
      click_count INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, word_id)
    );

    CREATE TABLE word_translations (
      word_id INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
      native_language TEXT NOT NULL,
      translation TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (word_id, native_language)
    );

    CREATE TABLE materials (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      language_id INTEGER NOT NULL REFERENCES languages(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_type TEXT NOT NULL,
      raw_text TEXT NOT NULL,
      word_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      reader_start INTEGER NOT NULL DEFAULT 0,
      import_status TEXT NOT NULL DEFAULT 'ready',
      import_total INTEGER NOT NULL DEFAULT 0,
      import_processed INTEGER NOT NULL DEFAULT 0,
      import_error TEXT
    );

    CREATE TABLE material_tokens (
      id SERIAL PRIMARY KEY,
      material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      surface TEXT NOT NULL,
      normalized TEXT NOT NULL,
      lemma TEXT NOT NULL,
      pos TEXT,
      word_id INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
      paragraph_index INTEGER NOT NULL DEFAULT 0,
      sentence_index INTEGER NOT NULL DEFAULT 0,
      conjugation_form TEXT,
      leading_text TEXT,
      trailing_text TEXT,
      block_index INTEGER,
      block_type TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (material_id, position)
    );

    CREATE INDEX idx_materials_user_language ON materials(user_id, language_id, created_at);
    CREATE INDEX idx_material_tokens_material_position ON material_tokens(material_id, position);
    CREATE INDEX idx_material_tokens_word ON material_tokens(word_id);
    CREATE INDEX idx_words_collection_lemma ON words(collection_id, lemma);

    CREATE TABLE jmdict_entries (
      expression TEXT NOT NULL,
      reading TEXT,
      gloss TEXT NOT NULL,
      priority INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (expression, gloss)
    );

    CREATE INDEX idx_jmdict_expression ON jmdict_entries(expression);
    CREATE INDEX idx_jmdict_reading ON jmdict_entries(reading);

    CREATE TABLE jmdict_english_index (
      english TEXT NOT NULL,
      expression TEXT NOT NULL,
      gloss TEXT NOT NULL,
      pos TEXT,
      priority INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (english, expression)
    );

    CREATE INDEX idx_jmdict_english ON jmdict_english_index(english);

    CREATE TABLE cedict_english_index (
      english TEXT NOT NULL,
      simplified TEXT NOT NULL,
      traditional TEXT NOT NULL,
      pinyin TEXT NOT NULL,
      definitions TEXT NOT NULL,
      pos TEXT,
      priority INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (english, simplified)
    );

    CREATE INDEX idx_cedict_english ON cedict_english_index(english);
    CREATE INDEX idx_cedict_simplified ON cedict_english_index(simplified);
    CREATE INDEX idx_cedict_traditional ON cedict_english_index(traditional);

    CREATE TABLE wikdict_english_japanese (
      english TEXT NOT NULL,
      japanese TEXT NOT NULL,
      pos TEXT,
      rank INTEGER NOT NULL DEFAULT 0,
      definition TEXT,
      PRIMARY KEY (english, japanese)
    );

    CREATE INDEX idx_wikdict_english_japanese ON wikdict_english_japanese(english, rank);

    CREATE TABLE wikdict_english_chinese (
      english TEXT NOT NULL,
      chinese TEXT NOT NULL,
      pos TEXT,
      rank INTEGER NOT NULL DEFAULT 0,
      definition TEXT,
      PRIMARY KEY (english, chinese)
    );

    CREATE INDEX idx_wikdict_english_chinese ON wikdict_english_chinese(english, rank);

    CREATE TABLE wikdict_spanish_english (
      spanish TEXT NOT NULL,
      english TEXT NOT NULL,
      pos TEXT,
      rank INTEGER NOT NULL DEFAULT 0,
      definition TEXT,
      PRIMARY KEY (spanish, english)
    );

    CREATE INDEX idx_wikdict_spanish_english ON wikdict_spanish_english(spanish, rank);

    CREATE TABLE wikdict_spanish_english_aliases (
      spanish TEXT PRIMARY KEY,
      headword TEXT NOT NULL
    );

    CREATE INDEX idx_wikdict_spanish_english_alias_headword ON wikdict_spanish_english_aliases(headword);

    CREATE TABLE wikdict_french_english (
      french TEXT NOT NULL,
      english TEXT NOT NULL,
      pos TEXT,
      rank INTEGER NOT NULL DEFAULT 0,
      definition TEXT,
      PRIMARY KEY (french, english)
    );

    CREATE INDEX idx_wikdict_french_english ON wikdict_french_english(french, rank);

    CREATE TABLE wikdict_french_english_aliases (
      french TEXT PRIMARY KEY,
      headword TEXT NOT NULL
    );

    CREATE INDEX idx_wikdict_french_english_alias_headword ON wikdict_french_english_aliases(headword);
  `);
};

export const down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS wikdict_french_english_aliases;
    DROP TABLE IF EXISTS wikdict_french_english;
    DROP TABLE IF EXISTS wikdict_spanish_english_aliases;
    DROP TABLE IF EXISTS wikdict_spanish_english;
    DROP TABLE IF EXISTS wikdict_english_chinese;
    DROP TABLE IF EXISTS wikdict_english_japanese;
    DROP TABLE IF EXISTS cedict_english_index;
    DROP TABLE IF EXISTS jmdict_english_index;
    DROP TABLE IF EXISTS jmdict_entries;
    DROP TABLE IF EXISTS material_tokens;
    DROP TABLE IF EXISTS materials;
    DROP TABLE IF EXISTS word_translations;
    DROP TABLE IF EXISTS user_word_status;
    DROP TABLE IF EXISTS words;
    DROP TABLE IF EXISTS collections;
    DROP TABLE IF EXISTS languages;
    DROP TABLE IF EXISTS predefined_languages;
    DROP TABLE IF EXISTS sessions;
    DROP TABLE IF EXISTS users;
  `);
};

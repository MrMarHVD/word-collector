// Make languages and words global, with per-user overlays.
//
// Before this migration a "language" row belonged to a single user, every
// collection hung off that per-user language, and every word row belonged to
// one user's collection. The same word imported by two users existed as two
// independent rows with two translations.
//
// After this migration:
//   - `languages` is global (unique name); `user_languages` records which
//     languages each user has enrolled in.
//   - `collections` are owned directly by a user (`user_id`) and point at a
//     global language.
//   - `words` are global per language (unique on the lemma key); the old
//     per-user `words.collection_id`/`words.translation` ownership is gone.
//   - `user_words` is each user's private subset of the global words, carrying
//     their collection placement and learning state (status, known,
//     click_count, want_to_practice) plus an optional per-user
//     `translation_override`. It replaces `user_word_status`.
//   - `word_translations` becomes the genuinely shared translation cache.
//
// Existing data is unified, never dropped: words that match across users are
// collapsed onto one global row (keeping each user's learning state as a
// user_words row), and material tokens are remapped onto the surviving word.
// Shared words are re-translated against the current dictionary logic by a
// separate one-shot script (scripts/backfill_global_translations.js); this
// migration carries the best existing translation forward in the meantime.
//
// The word identity key matches the application's import-resolution key:
//   lower(COALESCE(NULLIF(btrim(lemma), ''), word))   (per language)

export const up = (pgm) => {
  pgm.sql(`
    -------------------------------------------------------------------------
    -- A. Enrollment table + global language identity
    -------------------------------------------------------------------------
    CREATE TABLE user_languages (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      language_id INTEGER NOT NULL REFERENCES languages(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, language_id)
    );

    -- Canonical (surviving) global language id per case-insensitive name.
    CREATE TEMP TABLE lang_map ON COMMIT DROP AS
    SELECT id AS old_id,
           first_value(id) OVER (PARTITION BY lower(name) ORDER BY id) AS new_id
    FROM languages;

    -- Every user keeps access to each language they previously owned.
    INSERT INTO user_languages (user_id, language_id, created_at)
    SELECT l.user_id, m.new_id, l.created_at
    FROM languages l
    JOIN lang_map m ON m.old_id = l.id
    ON CONFLICT (user_id, language_id) DO NOTHING;

    -------------------------------------------------------------------------
    -- B. Capture collection ownership before the per-user link disappears
    -------------------------------------------------------------------------
    ALTER TABLE collections ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
    UPDATE collections c SET user_id = l.user_id
    FROM languages l WHERE l.id = c.language_id;

    -- Drop the old per-language uniqueness before repointing: two users' same
    -- named collections (e.g. "Uncollected") may now share one global language.
    -- The user-scoped uniqueness is added back in the contract phase.
    ALTER TABLE collections DROP CONSTRAINT collections_language_id_name_key;

    -- Repoint collections and materials at the canonical global language.
    UPDATE collections c SET language_id = m.new_id
    FROM lang_map m WHERE m.old_id = c.language_id;
    UPDATE materials x SET language_id = m.new_id
    FROM lang_map m WHERE m.old_id = x.language_id;

    -- Drop the duplicate per-user language rows, then make languages global.
    DELETE FROM languages l USING lang_map m
    WHERE m.old_id = l.id AND m.new_id <> l.id;
    ALTER TABLE languages DROP COLUMN user_id;
    ALTER TABLE languages ADD CONSTRAINT languages_name_key UNIQUE (name);

    -- Ensure the full study-language catalogue exists as global rows.
    INSERT INTO languages (name)
    SELECT name FROM predefined_languages
    ON CONFLICT (name) DO NOTHING;

    -------------------------------------------------------------------------
    -- C. Give words a language, then unify duplicates across users
    -------------------------------------------------------------------------
    ALTER TABLE words ADD COLUMN language_id INTEGER REFERENCES languages(id) ON DELETE CASCADE;
    UPDATE words w SET language_id = c.language_id
    FROM collections c WHERE c.id = w.collection_id;

    -- old word id -> surviving global word id, grouped by language + lemma key.
    CREATE TEMP TABLE word_map ON COMMIT DROP AS
    SELECT id AS old_id,
           first_value(id) OVER (
             PARTITION BY language_id, lower(COALESCE(NULLIF(btrim(lemma), ''), word))
             ORDER BY id
           ) AS new_id
    FROM words;

    -- Enrich the surviving word row with the richest metadata and a non-empty
    -- translation found anywhere in its group (canonical row = lowest id).
    UPDATE words kept SET
      translation = COALESCE(NULLIF(btrim(kept.translation), ''), best.translation, kept.translation),
      lemma = COALESCE(NULLIF(btrim(kept.lemma), ''), best.lemma),
      pos = COALESCE(NULLIF(btrim(kept.pos), ''), best.pos),
      pos_subcategory = COALESCE(NULLIF(btrim(kept.pos_subcategory), ''), best.pos_subcategory),
      reading = COALESCE(NULLIF(btrim(kept.reading), ''), best.reading),
      pinyin = COALESCE(NULLIF(btrim(kept.pinyin), ''), best.pinyin),
      traditional = COALESCE(NULLIF(btrim(kept.traditional), ''), best.traditional)
    FROM (
      SELECT wm.new_id,
             (array_remove(array_agg(NULLIF(btrim(w.translation), '') ORDER BY length(btrim(w.translation)) DESC), NULL))[1] AS translation,
             (array_remove(array_agg(NULLIF(btrim(w.lemma), '') ORDER BY w.id), NULL))[1] AS lemma,
             (array_remove(array_agg(NULLIF(btrim(w.pos), '') ORDER BY w.id), NULL))[1] AS pos,
             (array_remove(array_agg(NULLIF(btrim(w.pos_subcategory), '') ORDER BY w.id), NULL))[1] AS pos_subcategory,
             (array_remove(array_agg(NULLIF(btrim(w.reading), '') ORDER BY w.id), NULL))[1] AS reading,
             (array_remove(array_agg(NULLIF(btrim(w.pinyin), '') ORDER BY w.id), NULL))[1] AS pinyin,
             (array_remove(array_agg(NULLIF(btrim(w.traditional), '') ORDER BY w.id), NULL))[1] AS traditional
      FROM words w
      JOIN word_map wm ON wm.old_id = w.id
      GROUP BY wm.new_id
    ) best
    WHERE kept.id = best.new_id;

    -------------------------------------------------------------------------
    -- D. Per-user overlay (replaces user_word_status, adds membership)
    -------------------------------------------------------------------------
    CREATE TABLE user_words (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      word_id INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
      collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'unknown',
      known INTEGER NOT NULL DEFAULT 0,
      click_count INTEGER NOT NULL DEFAULT 0,
      want_to_practice INTEGER NOT NULL DEFAULT 0,
      translation_override TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, word_id)
    );

    -- One row per (user, surviving word). Self-duplicates (the same user having
    -- the word in two collections, or twice with different translations) are
    -- reconciled: most-progressed status, summed clicks, union want-to-practice,
    -- and a single collection preferring a named collection over "Uncollected".
    INSERT INTO user_words (user_id, word_id, collection_id, status, known, click_count, want_to_practice, created_at, updated_at)
    SELECT
      agg.user_id,
      agg.word_id,
      pick.collection_id,
      agg.status,
      CASE WHEN agg.status = 'known' THEN 1 ELSE 0 END AS known,
      agg.click_count,
      CASE WHEN agg.status = 'learning' THEN agg.want_to_practice ELSE 0 END AS want_to_practice,
      agg.created_at,
      now()
    FROM (
      SELECT
        c.user_id,
        wm.new_id AS word_id,
        (ARRAY['unknown', 'learning', 'known'])[
          MAX(CASE COALESCE(uws.status, 'unknown') WHEN 'known' THEN 3 WHEN 'learning' THEN 2 ELSE 1 END)
        ] AS status,
        COALESCE(SUM(uws.click_count), 0) AS click_count,
        COALESCE(MAX(uws.want_to_practice), 0) AS want_to_practice,
        MIN(w.created_at) AS created_at
      FROM words w
      JOIN collections c ON c.id = w.collection_id
      JOIN word_map wm ON wm.old_id = w.id
      LEFT JOIN user_word_status uws ON uws.word_id = w.id AND uws.user_id = c.user_id
      GROUP BY c.user_id, wm.new_id
    ) agg
    JOIN LATERAL (
      SELECT w2.collection_id
      FROM words w2
      JOIN collections c2 ON c2.id = w2.collection_id
      JOIN word_map wm2 ON wm2.old_id = w2.id
      LEFT JOIN user_word_status uws2 ON uws2.word_id = w2.id AND uws2.user_id = c2.user_id
      WHERE c2.user_id = agg.user_id AND wm2.new_id = agg.word_id
      ORDER BY
        (CASE WHEN lower(c2.name) = 'uncollected' THEN 1 ELSE 0 END) ASC,
        (CASE COALESCE(uws2.status, 'unknown') WHEN 'known' THEN 3 WHEN 'learning' THEN 2 ELSE 1 END) DESC,
        c2.id ASC
      LIMIT 1
    ) pick ON true;

    -------------------------------------------------------------------------
    -- E. Remap the shared translation cache and material tokens
    -------------------------------------------------------------------------
    CREATE TEMP TABLE word_translations_new ON COMMIT DROP AS
    SELECT DISTINCT ON (wm.new_id, wt.native_language)
      wm.new_id AS word_id, wt.native_language, wt.translation, wt.updated_at
    FROM word_translations wt
    JOIN word_map wm ON wm.old_id = wt.word_id
    ORDER BY wm.new_id, wt.native_language,
      (CASE WHEN btrim(COALESCE(wt.translation, '')) <> '' THEN 0 ELSE 1 END),
      wt.updated_at DESC;

    DELETE FROM word_translations;
    INSERT INTO word_translations (word_id, native_language, translation, updated_at)
    SELECT word_id, native_language, translation, updated_at FROM word_translations_new;

    UPDATE material_tokens mt SET word_id = wm.new_id
    FROM word_map wm WHERE wm.old_id = mt.word_id;

    -------------------------------------------------------------------------
    -- F. Drop the duplicate word rows (cascades remove their user_word_status)
    -------------------------------------------------------------------------
    DELETE FROM words w USING word_map wm
    WHERE wm.old_id = w.id AND wm.new_id <> w.id;

    -------------------------------------------------------------------------
    -- G. Contract: finalise the new shape and drop legacy structures
    -------------------------------------------------------------------------
    ALTER TABLE words DROP COLUMN collection_id;
    ALTER TABLE words DROP COLUMN known;
    ALTER TABLE words ALTER COLUMN language_id SET NOT NULL;
    CREATE UNIQUE INDEX words_language_lemma_key
      ON words (language_id, lower(COALESCE(NULLIF(btrim(lemma), ''), word)));
    CREATE INDEX idx_words_language ON words (language_id);

    ALTER TABLE collections ALTER COLUMN user_id SET NOT NULL;
    ALTER TABLE collections ADD CONSTRAINT collections_user_language_name_key UNIQUE (user_id, language_id, name);
    CREATE INDEX idx_collections_user_language ON collections (user_id, language_id);

    CREATE INDEX idx_user_words_user_word ON user_words (user_id, word_id);
    CREATE INDEX idx_user_words_word ON user_words (word_id);
    CREATE INDEX idx_user_words_collection ON user_words (collection_id);

    DROP TABLE user_word_status;
  `);
};

// This migration unifies duplicate word rows across users and is therefore
// not losslessly reversible. Refuse to run down rather than silently destroy
// the per-user data the up path consolidated.
export const down = () => {
  throw new Error(
    "1748000000007_global-languages-words is irreversible: it unifies per-user " +
      "words into shared global words. Restore from a backup instead of migrating down."
  );
};

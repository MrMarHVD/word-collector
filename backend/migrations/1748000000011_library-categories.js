/**
 * @file 1748000000011_library-categories.js
 * @description Adds per-user, per-language work categories and last-opened tracking.
 *
 * Schema changes:
 *  - `categories` table — user-defined groups for materials. Scoped to a user
 *    and a study language, ordered by `position`, with a case-insensitive
 *    unique name per user and language. Removed with the user (ON DELETE CASCADE).
 *  - `materials.category_id` (INTEGER, nullable) — optional category of the
 *    material. `NULL` means "uncategorised". ON DELETE SET NULL, so deleting a
 *    category never deletes its works.
 *  - `materials.last_opened_at` (TIMESTAMPTZ, nullable) — when the material was
 *    last opened in the Reader. `NULL` means never opened.
 *
 * Existing materials become uncategorised and never-opened. No data backfill.
 */

/**
 * Create the `categories` table and add the nullable material columns.
 *
 * @param {import('node-postgres-migrate').MigrationBuilder} pgm - Migration builder instance.
 */
export const up = (pgm) => {
  pgm.sql(`
    CREATE TABLE categories (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      language_id INTEGER NOT NULL REFERENCES languages(id) ON DELETE RESTRICT,
      name TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE UNIQUE INDEX categories_user_language_name_idx
      ON categories (user_id, language_id, lower(name));

    ALTER TABLE materials
      ADD COLUMN category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      ADD COLUMN last_opened_at TIMESTAMPTZ;

    CREATE INDEX materials_category_id_idx ON materials (category_id);
  `);
};

/**
 * Drop the material columns and the `categories` table.
 *
 * @param {import('node-postgres-migrate').MigrationBuilder} pgm - Migration builder instance.
 */
export const down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS materials_category_id_idx;
    ALTER TABLE materials
      DROP COLUMN IF EXISTS last_opened_at,
      DROP COLUMN IF EXISTS category_id;
    DROP TABLE IF EXISTS categories;
  `);
};

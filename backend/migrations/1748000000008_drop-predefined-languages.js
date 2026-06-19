/**
 * @file 1748000000008_drop-predefined-languages.js
 * @description Drops the now-unused `predefined_languages` table.
 *
 * The table held a static catalogue (English, Japanese, Chinese, Spanish, French)
 * that duplicated the `STUDY_LANGUAGE_OPTIONS` config constant. Its only runtime
 * reader populated an onboarding view that is never shown, and migration
 * 1748000000007 already seeded the global `languages` table from it, so the table
 * no longer serves any purpose. It holds no user-owned data.
 *
 * No user data is affected.
 */

/**
 * Drop the `predefined_languages` table.
 *
 * @param {import('node-postgres-migrate').MigrationBuilder} pgm - Migration builder instance.
 */
export const up = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS predefined_languages;`);
};

/**
 * Recreate and reseed the `predefined_languages` table, restoring the original
 * shape and catalogue so the migration is reversible.
 *
 * @param {import('node-postgres-migrate').MigrationBuilder} pgm - Migration builder instance.
 */
export const down = (pgm) => {
  pgm.sql(`
    CREATE TABLE predefined_languages (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    INSERT INTO predefined_languages (name)
    VALUES ('English'), ('Japanese'), ('Chinese'), ('Spanish'), ('French')
    ON CONFLICT (name) DO NOTHING;
  `);
};

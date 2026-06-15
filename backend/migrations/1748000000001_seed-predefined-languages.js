/**
 * @file 1748000000001_seed-predefined-languages.js
 * @description Seeds the fixed catalogue of study languages into `predefined_languages`.
 * These rows are read-only application data that backs the language picker shown
 * during onboarding. The insert uses `ON CONFLICT DO NOTHING` so re-running the
 * migration is safe. Languages seeded: English, Japanese, Chinese, Spanish, French.
 *
 * No schema changes are made; data only.
 */

/**
 * Insert the predefined language rows. Idempotent via `ON CONFLICT DO NOTHING`.
 *
 * @param {import('node-postgres-migrate').MigrationBuilder} pgm - Migration builder instance.
 */
export const up = (pgm) => {
  pgm.sql(`
    INSERT INTO predefined_languages (name)
    VALUES ('English'), ('Japanese'), ('Chinese'), ('Spanish'), ('French')
    ON CONFLICT (name) DO NOTHING;
  `);
};

/**
 * Remove the seeded language rows by name.
 *
 * @param {import('node-postgres-migrate').MigrationBuilder} pgm - Migration builder instance.
 */
export const down = (pgm) => {
  pgm.sql(`
    DELETE FROM predefined_languages
    WHERE name IN ('English', 'Japanese', 'Chinese', 'Spanish', 'French');
  `);
};

/**
 * @file 1748000000006_want-to-practice.js
 * @description Adds a per-user "want to practice" flag to `user_word_status`, enabling
 * users to mark individual learning-status words for prioritised review.
 *
 * Schema changes:
 *  - `user_word_status.want_to_practice` (INTEGER NOT NULL DEFAULT 0) — 1 when the
 *    user has flagged the word for extra practice, 0 otherwise. The flag is only
 *    meaningful when `status = 'learning'`; it is cleared whenever a word leaves
 *    that status (enforced in `words.repository.js`).
 *
 * Data backfill: none. All existing rows receive the default value of 0.
 * Note: `user_word_status` is replaced by `user_words` in migration 007, which
 * carries this column forward.
 */

/**
 * Add the `want_to_practice` column to `user_word_status`.
 *
 * @param {import('node-postgres-migrate').MigrationBuilder} pgm - Migration builder instance.
 */
export const up = (pgm) => {
  pgm.sql(`
    ALTER TABLE user_word_status
      ADD COLUMN want_to_practice INTEGER NOT NULL DEFAULT 0;
  `);
};

/**
 * Drop the `want_to_practice` column from `user_word_status`.
 *
 * @param {import('node-postgres-migrate').MigrationBuilder} pgm - Migration builder instance.
 */
export const down = (pgm) => {
  pgm.sql(`
    ALTER TABLE user_word_status
      DROP COLUMN want_to_practice;
  `);
};

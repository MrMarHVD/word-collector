/**
 * @file 1748000000005_words-lower-indexes.js
 * @description Adds functional (expression-based) indexes on the `words` table to
 * support the case-insensitive lookups performed by dictionary imports, the text
 * reader, and CSV uploads. The index expressions exactly mirror the predicates used
 * in `words.repository.js` so the query planner can use them as index scans.
 *
 * Indexes created:
 *  - `idx_words_lower_word`  — on `lower(word)`.
 *  - `idx_words_lower_lemma` — on `lower(COALESCE(lemma, word))`, matching the
 *    fallback behaviour when a word has no explicit lemma.
 *
 * No data changes; uses `CREATE INDEX IF NOT EXISTS` for idempotency.
 */

/**
 * Create the case-insensitive functional indexes on `words`.
 *
 * @param {import('node-postgres-migrate').MigrationBuilder} pgm - Migration builder instance.
 */
export const up = (pgm) => {
  pgm.sql(`
    CREATE INDEX IF NOT EXISTS idx_words_lower_word ON words (lower(word));
    CREATE INDEX IF NOT EXISTS idx_words_lower_lemma ON words (lower(COALESCE(lemma, word)));
  `);
};

/**
 * Drop the functional word-lookup indexes.
 *
 * @param {import('node-postgres-migrate').MigrationBuilder} pgm - Migration builder instance.
 */
export const down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS idx_words_lower_lemma;
    DROP INDEX IF EXISTS idx_words_lower_word;
  `);
};

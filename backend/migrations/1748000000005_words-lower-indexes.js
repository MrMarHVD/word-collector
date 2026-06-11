// Functional indexes for the case-insensitive word lookups used by imports,
// the reader, and CSV uploads. The expressions mirror the predicates in
// words.repository.js exactly so the planner can use them.

export const up = (pgm) => {
  pgm.sql(`
    CREATE INDEX IF NOT EXISTS idx_words_lower_word ON words (lower(word));
    CREATE INDEX IF NOT EXISTS idx_words_lower_lemma ON words (lower(COALESCE(lemma, word)));
  `);
};

export const down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS idx_words_lower_lemma;
    DROP INDEX IF EXISTS idx_words_lower_word;
  `);
};

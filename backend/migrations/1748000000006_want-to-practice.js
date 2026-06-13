// Adds a per-user "want to practice" flag to user_word_status. The flag is only
// meaningful while a word is in the 'learning' status; it is cleared whenever a
// word leaves that status (enforced in words.repository.js). Existing rows keep
// the default 0, so no data is altered.

export const up = (pgm) => {
  pgm.sql(`
    ALTER TABLE user_word_status
      ADD COLUMN want_to_practice INTEGER NOT NULL DEFAULT 0;
  `);
};

export const down = (pgm) => {
  pgm.sql(`
    ALTER TABLE user_word_status
      DROP COLUMN want_to_practice;
  `);
};

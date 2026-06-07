// Store display names returned by OAuth providers for account details.

export const up = (pgm) => {
  pgm.sql(`
    ALTER TABLE oauth_accounts ADD COLUMN IF NOT EXISTS display_name TEXT;
  `);
};

export const down = (pgm) => {
  pgm.sql(`
    ALTER TABLE oauth_accounts DROP COLUMN IF EXISTS display_name;
  `);
};

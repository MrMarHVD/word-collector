/**
 * @file 1748000000004_oauth-display-name.js
 * @description Adds an optional `display_name` column to `oauth_accounts` to persist
 * the human-readable name returned by the OAuth provider (e.g. the full name from a
 * Google profile). The column is nullable so existing rows are unaffected.
 *
 * Schema changes:
 *  - `oauth_accounts.display_name` (TEXT, nullable) — provider-supplied display name.
 *
 * No data backfill; uses `ADD COLUMN IF NOT EXISTS` for idempotency.
 */

/**
 * Add the `display_name` column to `oauth_accounts`.
 *
 * @param {import('node-postgres-migrate').MigrationBuilder} pgm - Migration builder instance.
 */
export const up = (pgm) => {
  pgm.sql(`
    ALTER TABLE oauth_accounts ADD COLUMN IF NOT EXISTS display_name TEXT;
  `);
};

/**
 * Drop the `display_name` column from `oauth_accounts`.
 *
 * @param {import('node-postgres-migrate').MigrationBuilder} pgm - Migration builder instance.
 */
export const down = (pgm) => {
  pgm.sql(`
    ALTER TABLE oauth_accounts DROP COLUMN IF EXISTS display_name;
  `);
};

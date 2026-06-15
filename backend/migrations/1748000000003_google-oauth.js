/**
 * @file 1748000000003_google-oauth.js
 * @description Phase 5 — Google OAuth support. Additive migration that allows accounts
 * to be linked to one or more external identity providers (initially Google) without
 * requiring a local password.
 *
 * Schema changes:
 *  - `users.password_hash` and `users.password_salt` become nullable, enabling
 *    "OAuth-only" accounts that were created without a local password.
 *  - `oauth_accounts` table — links a user to an external provider identity via
 *    (`provider`, `provider_user_id`). A user may have at most one linked account
 *    per provider (unique on `user_id, provider`). Cascade-deleted with the user.
 *  - Index on `oauth_accounts(user_id)` for fast provider-list lookups per user.
 *
 * No data backfill is performed; existing password-based users are unaffected.
 */

/**
 * Apply OAuth changes: make password columns nullable and create `oauth_accounts`.
 *
 * @param {import('node-postgres-migrate').MigrationBuilder} pgm - Migration builder instance.
 */
export const up = (pgm) => {
  pgm.sql(`
    ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
    ALTER TABLE users ALTER COLUMN password_salt DROP NOT NULL;

    CREATE TABLE oauth_accounts (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      provider_user_id TEXT NOT NULL,
      email TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (provider, provider_user_id),
      UNIQUE (user_id, provider)
    );

    CREATE INDEX idx_oauth_accounts_user ON oauth_accounts(user_id);
  `);
};

/**
 * Revert OAuth changes: drop `oauth_accounts` and its index.
 * Note: `password_hash` and `password_salt` are not restored to NOT NULL because
 * OAuth-only accounts created after this migration would violate the constraint.
 *
 * @param {import('node-postgres-migrate').MigrationBuilder} pgm - Migration builder instance.
 */
export const down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS idx_oauth_accounts_user;
    DROP TABLE IF EXISTS oauth_accounts;
  `);
};

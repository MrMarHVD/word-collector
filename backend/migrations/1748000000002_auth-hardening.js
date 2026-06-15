/**
 * @file 1748000000002_auth-hardening.js
 * @description Phase 4 — auth hardening. Additive, non-destructive migration that
 * introduces email verification state and a single-use token table used by
 * email-verification and password-reset flows.
 *
 * Schema changes:
 *  - `users.email_verified` (BOOLEAN NOT NULL DEFAULT false) — tracks whether the
 *    account email has been confirmed via a verification link.
 *  - `auth_tokens` table — stores the SHA-256 hash of each single-use token
 *    (`id`), its `type` (verification | passwordReset), `expires_at`, and
 *    `used_at`. Raw token values are never persisted, limiting exposure from a
 *    database leak.
 *  - Indexes on `auth_tokens(user_id, type)`, `sessions(user_id)`, and
 *    `sessions(expires_at)` for efficient per-user revocation and expiry sweeps.
 *
 * Data backfill: all pre-existing users are marked `email_verified = true`
 * immediately after the column is added, so users who registered before this
 * feature are never nagged by the verification banner.
 */

/**
 * Apply auth-hardening changes: add `email_verified`, backfill existing users,
 * create `auth_tokens`, and add session lookup indexes.
 *
 * @param {import('node-postgres-migrate').MigrationBuilder} pgm - Migration builder instance.
 */
export const up = (pgm) => {
  pgm.sql(`
    ALTER TABLE users ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT false;

    -- Existing accounts predate email verification; mark them verified so the
    -- soft reminder banner never nags users who registered before this feature.
    UPDATE users SET email_verified = true;

    -- Single-use, expiring tokens for email verification and password reset.
    -- Only the SHA-256 hash of the token is stored (id), never the raw value,
    -- so a database leak does not expose usable links.
    CREATE TABLE auth_tokens (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX idx_auth_tokens_user_type ON auth_tokens(user_id, type);

    -- Sessions are looked up on every authenticated request; index the expiry
    -- sweep and the per-user revocation path.
    CREATE INDEX idx_sessions_user ON sessions(user_id);
    CREATE INDEX idx_sessions_expires ON sessions(expires_at);
  `);
};

/**
 * Revert auth-hardening changes: drop the session indexes, `auth_tokens` table,
 * and the `email_verified` column.
 *
 * @param {import('node-postgres-migrate').MigrationBuilder} pgm - Migration builder instance.
 */
export const down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS idx_sessions_expires;
    DROP INDEX IF EXISTS idx_sessions_user;
    DROP TABLE IF EXISTS auth_tokens;
    ALTER TABLE users DROP COLUMN IF EXISTS email_verified;
  `);
};

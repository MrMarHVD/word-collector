// Phase 4 — auth hardening. Adds email verification state and a hashed-token
// table for email-verification and password-reset links. The `sessions` table
// already exists in the baseline schema and is activated by this phase's code.
// Additive and non-destructive: existing data is preserved.

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

export const down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS idx_sessions_expires;
    DROP INDEX IF EXISTS idx_sessions_user;
    DROP TABLE IF EXISTS auth_tokens;
    ALTER TABLE users DROP COLUMN IF EXISTS email_verified;
  `);
};

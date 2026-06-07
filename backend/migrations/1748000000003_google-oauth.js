// Phase 5 — Google OAuth. Additive account-linking storage for external
// identity providers. Password columns become nullable so Google-only accounts
// can exist without synthetic password material.

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

export const down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS idx_oauth_accounts_user;
    DROP TABLE IF EXISTS oauth_accounts;
  `);
};

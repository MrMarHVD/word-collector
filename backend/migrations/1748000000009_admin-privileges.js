/**
 * @file 1748000000009_admin-privileges.js
 * @description Introduces the admin/superadmin privilege model and audit infrastructure.
 *
 * Schema changes:
 *  - `users.is_admin` (BOOLEAN NOT NULL DEFAULT false) — grants access to the
 *    Admin tab and admin-scoped operations.
 *  - `users.is_superadmin` (BOOLEAN NOT NULL DEFAULT false) — grants access to the
 *    Superadmin subtab and superadmin-only operations. Settable only via the
 *    provisioning script, never via the API/UI.
 *  - `admin_audit_log` table — append-only record of privileged actions. Each row
 *    captures the acting user (`actor_id`), the `action` performed, an optional
 *    `target` descriptor, and the JSON `before`/`after` snapshots of the affected
 *    state, with a `created_at` timestamp. `actor_id` is nullable with
 *    `ON DELETE SET NULL` so the audit trail survives actor account deletion.
 *
 * Data backfill: none. All existing users receive the default `false` for both
 * privilege columns; the audit log starts empty.
 */

/**
 * Add the privilege columns to `users` and create the `admin_audit_log` table.
 *
 * @param {import('node-postgres-migrate').MigrationBuilder} pgm - Migration builder instance.
 */
export const up = (pgm) => {
  pgm.sql(`
    ALTER TABLE users
      ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN is_superadmin BOOLEAN NOT NULL DEFAULT false;

    CREATE TABLE admin_audit_log (
      id SERIAL PRIMARY KEY,
      actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      target TEXT,
      before_value JSONB,
      after_value JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX idx_admin_audit_log_actor ON admin_audit_log(actor_id);
    CREATE INDEX idx_admin_audit_log_created_at ON admin_audit_log(created_at);
  `);
};

/**
 * Drop the audit table and remove the privilege columns from `users`.
 *
 * @param {import('node-postgres-migrate').MigrationBuilder} pgm - Migration builder instance.
 */
export const down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS idx_admin_audit_log_created_at;
    DROP INDEX IF EXISTS idx_admin_audit_log_actor;
    DROP TABLE IF EXISTS admin_audit_log;

    ALTER TABLE users
      DROP COLUMN IF EXISTS is_superadmin,
      DROP COLUMN IF EXISTS is_admin;
  `);
};

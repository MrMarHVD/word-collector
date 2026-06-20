/**
 * @file 1748000000010_user-material-limit-overrides.js
 * @description Adds per-user override columns for the two material limits.
 *
 * Schema changes:
 *  - `users.max_materials` (INTEGER, nullable) — per-user cap on the number of
 *    documents the user may keep. `NULL` means "use the global default"
 *    (`BETA_MAX_MATERIALS_PER_USER`).
 *  - `users.max_upload_bytes` (BIGINT, nullable) — per-user cap on the size of a
 *    single uploaded document, in bytes. `NULL` means "use the global default"
 *    (`BETA_MAX_MATERIAL_UPLOAD_BYTES`).
 *
 * Both columns default to `NULL`, so every existing user keeps the global
 * defaults until an admin sets an explicit override. No data backfill.
 */

/**
 * Add the nullable material-limit override columns to `users`.
 *
 * @param {import('node-postgres-migrate').MigrationBuilder} pgm - Migration builder instance.
 */
export const up = (pgm) => {
  pgm.sql(`
    ALTER TABLE users
      ADD COLUMN max_materials INTEGER,
      ADD COLUMN max_upload_bytes BIGINT;
  `);
};

/**
 * Remove the material-limit override columns from `users`.
 *
 * @param {import('node-postgres-migrate').MigrationBuilder} pgm - Migration builder instance.
 */
export const down = (pgm) => {
  pgm.sql(`
    ALTER TABLE users
      DROP COLUMN IF EXISTS max_upload_bytes,
      DROP COLUMN IF EXISTS max_materials;
  `);
};

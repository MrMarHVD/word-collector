/**
 * @file provision_admin.js
 * @description One-off admin account provisioning script. Creates a local-auth user
 * with the supplied credentials, or resets the password if the account already exists,
 * and optionally grants the admin and/or superadmin privilege flags.
 *
 * The script is idempotent: running it multiple times with the same email address
 * only updates the password hash, salt, and (when requested) the privilege flags;
 * it does not create duplicate rows.
 *
 * The superadmin flag is settable ONLY through this script — never via any API or UI —
 * so the highest privilege tier cannot be self-granted at runtime.
 *
 * Prerequisites: run `npm run migrate:up` before this script; it requires the `users`
 * table (with the `is_admin` / `is_superadmin` columns) to exist.
 *
 * Environment variables:
 *  - `ADMIN_EMAIL`      (required) — email address for the account.
 *  - `ADMIN_PASSWORD`   (required) — plaintext password; hashed before storage using
 *    the application's standard `hashPassword` utility.
 *  - `ADMIN_IS_ADMIN`      (optional) — `"true"`/`"1"` to set the admin flag, `"false"`/`"0"`
 *    to clear it. Omit to leave the existing value unchanged.
 *  - `ADMIN_IS_SUPERADMIN` (optional) — `"true"`/`"1"` to set the superadmin flag,
 *    `"false"`/`"0"` to clear it. Omit to leave the existing value unchanged.
 *
 * CLI usage:
 * ```
 * ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=secret ADMIN_IS_SUPERADMIN=true npm run provision:admin
 * ```
 *
 * Database side effects:
 *  - Inserts a new row into `users`, or updates `password_hash` / `password_salt`
 *    (and privilege flags when provided) for an existing row matched by email
 *    (case-insensitive). New rows are created with the requested flags, defaulting
 *    to false when the corresponding env var is omitted.
 *
 * Exits with code 1 if either required environment variable is missing.
 */
import { db, pool } from "../src/db/index.js";
import { hashPassword } from "../src/auth/password.js";
import { normalizeName } from "../src/shared/normalize.js";

const email = normalizeName(process.env.ADMIN_EMAIL || "").toLowerCase();
const password = String(process.env.ADMIN_PASSWORD || "");

if (!email || !password) {
  console.error("Set ADMIN_EMAIL and ADMIN_PASSWORD environment variables.");
  process.exit(1);
}

/**
 * Parse an optional boolean privilege flag from an environment variable.
 *
 * @param {string|undefined} raw - The raw environment value.
 * @returns {boolean|null} `true`/`false` when explicitly provided, or `null` when
 *   the variable is unset so the existing value is left untouched.
 */
function parseFlag(raw) {
  if (raw === undefined || raw === "") {
    return null;
  }
  return /^(1|true|yes|on)$/i.test(String(raw).trim());
}

const isAdmin = parseFlag(process.env.ADMIN_IS_ADMIN);
const isSuperadmin = parseFlag(process.env.ADMIN_IS_SUPERADMIN);

try {
  const { hash, salt } = hashPassword(password);
  const existing = await db.prepare("SELECT id FROM users WHERE lower(email) = lower(?)").get(email);

  if (existing) {
    await db.prepare("UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?").run(hash, salt, existing.id);
    if (isAdmin !== null) {
      await db.prepare("UPDATE users SET is_admin = ? WHERE id = ?").run(isAdmin, existing.id);
    }
    if (isSuperadmin !== null) {
      await db.prepare("UPDATE users SET is_superadmin = ? WHERE id = ?").run(isSuperadmin, existing.id);
    }
    console.log(`Updated user: ${email} (is_admin=${isAdmin ?? "unchanged"}, is_superadmin=${isSuperadmin ?? "unchanged"})`);
  } else {
    await db
      .prepare("INSERT INTO users (email, password_hash, password_salt, is_admin, is_superadmin) VALUES (?, ?, ?, ?, ?)")
      .run(email, hash, salt, isAdmin === true, isSuperadmin === true);
    console.log(`Created user: ${email} (is_admin=${isAdmin === true}, is_superadmin=${isSuperadmin === true})`);
  }
} finally {
  await pool.end();
}

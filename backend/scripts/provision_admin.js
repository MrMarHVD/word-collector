/**
 * @file provision_admin.js
 * @description One-off admin account provisioning script. Creates a local-auth user
 * with the supplied credentials, or resets the password if the account already exists.
 *
 * The script is idempotent: running it multiple times with the same email address
 * only updates the password hash and salt; it does not create duplicate rows.
 *
 * Prerequisites: run `npm run migrate:up` before this script; it requires the `users`
 * table to exist.
 *
 * Environment variables (required):
 *  - `ADMIN_EMAIL`    — email address for the admin account.
 *  - `ADMIN_PASSWORD` — plaintext password; hashed before storage using the
 *    application's standard `hashPassword` utility.
 *
 * CLI usage:
 * ```
 * ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=secret npm run provision:admin
 * ```
 *
 * Database side effects:
 *  - Inserts a new row into `users`, or updates `password_hash` / `password_salt`
 *    for an existing row matched by email (case-insensitive).
 *
 * Exits with code 1 if either environment variable is missing.
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

try {
  const { hash, salt } = hashPassword(password);
  const existing = await db.prepare("SELECT id FROM users WHERE lower(email) = lower(?)").get(email);

  if (existing) {
    await db.prepare("UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?").run(hash, salt, existing.id);
    console.log(`Updated password for existing user: ${email}`);
  } else {
    await db.prepare("INSERT INTO users (email, password_hash, password_salt) VALUES (?, ?, ?)").run(email, hash, salt);
    console.log(`Created admin user: ${email}`);
  }
} finally {
  await pool.end();
}

import { db, pool } from "../src/db/index.js";
import { hashPassword } from "../src/auth/password.js";
import { normalizeName } from "../src/shared/normalize.js";

// One-off admin provisioning. Reads ADMIN_EMAIL and ADMIN_PASSWORD from the
// environment and creates the user, or resets the password if they exist.
// Run migrations first (`npm run migrate:up`); this script assumes the schema
// already exists.
// Usage: ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=... npm run provision:admin
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

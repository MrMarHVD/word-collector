import { db } from "../src/db/index.js";
import { runMigrations } from "../src/db/migrate.js";
import { hashPassword } from "../src/auth/password.js";
import { normalizeName } from "../src/shared/normalize.js";

// One-off admin provisioning. Reads ADMIN_EMAIL and ADMIN_PASSWORD from the
// environment and creates the user, or resets the password if they exist.
// Usage: ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=... npm run provision:admin
const email = normalizeName(process.env.ADMIN_EMAIL || "").toLowerCase();
const password = String(process.env.ADMIN_PASSWORD || "");

if (!email || !password) {
  console.error("Set ADMIN_EMAIL and ADMIN_PASSWORD environment variables.");
  process.exit(1);
}

runMigrations(db);

const { hash, salt } = hashPassword(password);
const existing = db.prepare("SELECT id FROM users WHERE lower(email) = lower(?)").get(email);

if (existing) {
  db.prepare("UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?").run(hash, salt, existing.id);
  console.log(`Updated password for existing user: ${email}`);
} else {
  db.prepare("INSERT INTO users (email, password_hash, password_salt) VALUES (?, ?, ?)").run(email, hash, salt);
  console.log(`Created admin user: ${email}`);
}

import { pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";

// Dependency-free password hashing with per-user salts.
// Hash a password with PBKDF2 and return the salt and digest.
export function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  const hash = pbkdf2Sync(password, salt, 120_000, 32, "sha256").toString("hex");
  return { salt, hash };
}

// Compare a password against a stored PBKDF2 hash.
export function verifyPassword(password, salt, expectedHash) {
  const actual = pbkdf2Sync(password, salt, 120_000, 32, "sha256");
  const expected = Buffer.from(expectedHash, "hex");
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}

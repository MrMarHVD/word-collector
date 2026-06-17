/**
 * @fileoverview Dependency-free password hashing and verification.
 *
 * Uses PBKDF2-SHA256 with a 120,000-iteration count and a random per-user salt.
 * The salt and hash are stored separately so they can be retrieved for
 * verification without needing a structured hash string format.
 */

import { pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Hashes a password with PBKDF2-SHA256 using a random (or supplied) salt.
 *
 * @param {string} password - Plaintext password to hash.
 * @param {string} [salt] - Hex-encoded salt; a fresh 16-byte salt is generated when omitted.
 * @returns {{ salt: string, hash: string }} Both values should be stored; `salt`
 *   is needed to verify the password later.
 */
export function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  const hash = pbkdf2Sync(password, salt, 120_000, 32, "sha256").toString("hex");
  return { salt, hash };
}

/**
 * Verifies a plaintext password against a stored PBKDF2 hash.
 * Uses constant-time comparison to prevent timing attacks.
 *
 * @param {string} password - Plaintext password to check.
 * @param {string} salt - Hex-encoded salt stored alongside the hash.
 * @param {string} expectedHash - Hex-encoded hash from the database.
 * @returns {boolean} `true` when the password matches.
 */
export function verifyPassword(password, salt, expectedHash) {
  const actual = pbkdf2Sync(password, salt, 120_000, 32, "sha256");
  const expected = Buffer.from(expectedHash, "hex");
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}

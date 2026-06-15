/**
 * @fileoverview Opaque token generation and hashing.
 *
 * Provides the two-phase token pattern used by session cookies and emailed auth
 * links: a high-entropy random value is sent to the client while only its
 * SHA-256 hash is stored server-side.  A database breach therefore never yields
 * a token that can be replayed against the API.
 */

import { createHash, randomBytes } from "node:crypto";

/**
 * Hashes a raw token with SHA-256 for storage or lookup.
 * The hash is the only form persisted to the database.
 *
 * @param {string} raw - The plaintext token value.
 * @returns {string} Lowercase hex digest.
 */
export function hashToken(raw) {
  return createHash("sha256").update(String(raw)).digest("hex");
}

/**
 * Generates a cryptographically random token and its SHA-256 hash.
 *
 * @param {number} [bytes=32] - Number of random bytes (determines entropy).
 * @returns {{ raw: string, hash: string }} `raw` is the base64url-encoded value
 *   to send to the client; `hash` is the hex digest to store in the database.
 */
export function generateToken(bytes = 32) {
  const raw = randomBytes(bytes).toString("base64url");
  return { raw, hash: hashToken(raw) };
}

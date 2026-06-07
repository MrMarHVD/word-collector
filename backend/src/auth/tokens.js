import { createHash, randomBytes } from "node:crypto";

// Opaque token helpers shared by session cookies and emailed auth links. The
// raw token is sent to the client (cookie or email); only its SHA-256 hash is
// persisted, so a database leak never yields a usable token.

// Hash a raw token for storage / lookup.
export function hashToken(raw) {
  return createHash("sha256").update(String(raw)).digest("hex");
}

// Generate a high-entropy token and its storage hash.
export function generateToken(bytes = 32) {
  const raw = randomBytes(bytes).toString("base64url");
  return { raw, hash: hashToken(raw) };
}

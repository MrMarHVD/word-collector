/**
 * @fileoverview Minimal HS256 JWT implementation.
 *
 * A dependency-free JSON Web Token library covering only the subset used by this
 * application: creating and verifying HS256-signed session tokens.  Standard
 * `sub`, `email`, `iat`, `exp`, and `jti` claims are included.
 *
 * Note: the primary session mechanism is the opaque cookie + database-backed
 * session in {@link module:auth/session}.  JWTs are used where a stateless,
 * self-contained bearer token is more appropriate (e.g. email verification
 * links or passwordless sign-in flows).
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { JWT_SECRET, JWT_TTL_SECONDS } from "../config.js";

// Encode a value as base64url JSON for JWT segments.
function base64UrlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

// Sign a JWT header and payload using HMAC-SHA256.
function signJwt(header, payload) {
  const data = `${base64UrlJson(header)}.${base64UrlJson(payload)}`;
  const signature = createHmac("sha256", JWT_SECRET).update(data).digest("base64url");
  return `${data}.${signature}`;
}

/**
 * Creates a signed HS256 JWT for the given user.
 *
 * The token includes `sub` (user ID as string), `email`, `iat`, `exp`
 * (`JWT_TTL_SECONDS` from now), and a random `jti` to make each token unique.
 *
 * @param {{ id: number|string, email: string }} user
 * @returns {string} A compact `header.payload.signature` JWT string.
 */
export function createJwt(user) {
  const now = Math.floor(Date.now() / 1000);
  return signJwt(
    { alg: "HS256", typ: "JWT" },
    {
      sub: String(user.id),
      email: user.email,
      iat: now,
      exp: now + JWT_TTL_SECONDS,
      jti: randomBytes(16).toString("hex")
    }
  );
}

/**
 * Verifies the signature, algorithm, and expiry of a JWT and returns its
 * decoded payload.
 *
 * Returns `null` (rather than throwing) on any verification failure so callers
 * can treat an invalid token as "unauthenticated" without a try/catch.
 *
 * @param {string | undefined} token - Compact JWT string to verify.
 * @returns {{ sub: string, email: string, iat: number, exp: number, jti: string } | null}
 *   Decoded payload, or `null` when the token is missing, malformed, has an
 *   invalid signature, or is expired.
 */
export function verifyJwt(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) {
    return null;
  }

  const [encodedHeader, encodedPayload, signature] = parts;
  const data = `${encodedHeader}.${encodedPayload}`;
  const expected = createHmac("sha256", JWT_SECRET).update(data).digest("base64url");
  const actual = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  // Compare only after checking lengths because timingSafeEqual requires it.
  if (actual.length !== expectedBuffer.length || !timingSafeEqual(actual, expectedBuffer)) {
    return null;
  }

  try {
    const header = JSON.parse(Buffer.from(encodedHeader, "base64url").toString("utf8"));
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
    const now = Math.floor(Date.now() / 1000);
    if (header.alg !== "HS256" || header.typ !== "JWT" || !payload.sub || !payload.exp || payload.exp <= now) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

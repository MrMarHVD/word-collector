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

// Create a signed session token for a user row.
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

// Verify a JWT and return its payload when signature and expiry are valid.
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

/**
 * @fileoverview Stateless CSRF token creation and verification.
 *
 * Tokens are short-lived (24 h), HMAC-SHA256-signed with `JWT_SECRET`, and
 * bound to a session context.  An anonymous session uses the literal string
 * `"anonymous"` as the context, so a token issued before login cannot be
 * replayed after a new session is established.
 *
 * Tokens are delivered to the client at login and must be echoed back in the
 * `X-CSRF-Token` header on every state-mutating request.  Because the `HttpOnly`
 * session cookie is not accessible to JavaScript, this separate header proves the
 * request originated from the legitimate frontend.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { JWT_SECRET } from "../config.js";

const CSRF_TTL_SECONDS = 24 * 60 * 60;
const CSRF_CONTEXT_ANONYMOUS = "anonymous";

function csrfContext(sessionId) {
  return sessionId || CSRF_CONTEXT_ANONYMOUS;
}

function sign(data) {
  return createHmac("sha256", JWT_SECRET).update(data).digest("base64url");
}

function safeEqualString(a, b) {
  const actual = Buffer.from(String(a || ""));
  const expected = Buffer.from(String(b || ""));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/**
 * Mints a signed CSRF token tied to the given session.
 *
 * The token encodes a context string derived from `sessionId` and a 24-hour
 * expiry, then appends an HMAC-SHA256 signature.  Pass `null` or `undefined`
 * for `sessionId` to produce an anonymous-context token (e.g. for the login
 * form before a session exists).
 *
 * @param {string | null | undefined} sessionId - The SHA-256 session hash from the database.
 * @returns {string} A `base64url-payload.base64url-signature` token string.
 */
export function createCsrfToken(sessionId) {
  const payload = {
    ctx: csrfContext(sessionId),
    exp: Math.floor(Date.now() / 1000) + CSRF_TTL_SECONDS
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encodedPayload}.${sign(encodedPayload)}`;
}

/**
 * Verifies a CSRF token from the `X-CSRF-Token` request header.
 *
 * Returns `true` only when the token's HMAC signature is valid, the expiry has
 * not passed, and the embedded context matches the current session.  All
 * comparisons use constant-time equality to prevent timing attacks.
 *
 * @param {string | undefined} token - Value of the `X-CSRF-Token` header.
 * @param {string | null | undefined} sessionId - The SHA-256 session hash for the request.
 * @returns {boolean}
 */
export function verifyCsrfToken(token, sessionId) {
  const [encodedPayload, signature, extra] = String(token || "").split(".");
  if (!encodedPayload || !signature || extra !== undefined) {
    return false;
  }
  if (!safeEqualString(signature, sign(encodedPayload))) {
    return false;
  }
  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
    const now = Math.floor(Date.now() / 1000);
    return payload.ctx === csrfContext(sessionId) && Number(payload.exp) > now;
  } catch {
    return false;
  }
}

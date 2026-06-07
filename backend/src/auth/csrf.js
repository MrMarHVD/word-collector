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

export function createCsrfToken(sessionId) {
  const payload = {
    ctx: csrfContext(sessionId),
    exp: Math.floor(Date.now() / 1000) + CSRF_TTL_SECONDS
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encodedPayload}.${sign(encodedPayload)}`;
}

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

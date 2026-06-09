import { jsonResponse } from "./response.js";
import { TRUSTED_PROXY_IPS } from "../config.js";

// Lightweight in-memory rate limiter for abuse-prone auth endpoints. A fixed
// window per (key) keeps the implementation simple and dependency-free; it is
// per-process, which is sufficient for a single-instance deployment. Move to a
// shared store (Redis) if the app is ever scaled horizontally.

function normalizeIp(value) {
  return String(value || "").replace(/^::ffff:/, "").trim();
}

// Derive a best-effort client identifier. Only trust X-Forwarded-For when the
// direct peer is a configured trusted reverse proxy.
export function clientIp(req) {
  const remote = normalizeIp(req.socket?.remoteAddress) || "unknown";
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return TRUSTED_PROXY_IPS.includes(remote) && forwarded ? normalizeIp(forwarded) : remote;
}

// Create a limiter that allows `max` hits per `windowMs` for a given key. The
// returned `check(key)` returns { allowed, retryAfterSeconds }. Expired windows
// are pruned lazily on access and periodically to bound memory.
export function createRateLimiter({ max, windowMs }) {
  const hits = new Map();

  function check(key) {
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || now >= entry.resetAt) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return { allowed: true };
    }
    if (entry.count < max) {
      entry.count += 1;
      return { allowed: true };
    }
    return { allowed: false, retryAfterSeconds: Math.ceil((entry.resetAt - now) / 1000) };
  }

  // Periodic sweep so keys for idle clients do not accumulate forever.
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) {
      if (now >= entry.resetAt) {
        hits.delete(key);
      }
    }
  }, windowMs);
  sweep.unref?.();

  return { check };
}

// Guard a request with one or more limiters keyed by the given parts. Writes a
// 429 response and returns false when any limiter is exhausted; returns true
// when the request may proceed.
export function enforceRateLimit(res, limiter, key) {
  const result = limiter.check(key);
  if (result.allowed) {
    return true;
  }
  res.setHeader("retry-after", String(result.retryAfterSeconds));
  jsonResponse(res, 429, {
    error: "Too many attempts. Please try again later.",
    errorKey: "errors.tooManyAttempts"
  });
  return false;
}

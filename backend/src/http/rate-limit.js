/**
 * @fileoverview In-process fixed-window rate limiter for abuse-prone endpoints.
 *
 * State lives in a `Map` inside each limiter instance — no external store is
 * required. This is sufficient for a single-process deployment. If the app is
 * ever scaled horizontally, replace the `Map` with a shared store such as Redis.
 *
 * Expired windows are pruned both lazily on access and periodically via a
 * `setInterval` sweep (unref'd so it does not prevent process exit) to prevent
 * unbounded memory growth from idle client keys.
 */

import { jsonResponse } from "./response.js";
import { TRUSTED_PROXY_IPS } from "../config.js";

// Lightweight in-memory rate limiter for abuse-prone auth endpoints. A fixed
// window per (key) keeps the implementation simple and dependency-free; it is
// per-process, which is sufficient for a single-instance deployment. Move to a
// shared store (Redis) if the app is ever scaled horizontally.

function normalizeIp(value) {
  return String(value || "").replace(/^::ffff:/, "").trim();
}

/**
 * Derives the best-effort client IP address from a request.
 *
 * `X-Forwarded-For` is only trusted when the direct TCP peer is in
 * `TRUSTED_PROXY_IPS`. This prevents a remote client from spoofing its IP by
 * injecting the header directly. The IPv4-mapped IPv6 prefix `::ffff:` is
 * stripped so consumers receive a plain IPv4 string in all cases.
 *
 * @param {import("node:http").IncomingMessage} req - The incoming HTTP request.
 * @returns {string} IPv4 or IPv6 address string, or `"unknown"` if not determinable.
 */
export function clientIp(req) {
  const remote = normalizeIp(req.socket?.remoteAddress) || "unknown";
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return TRUSTED_PROXY_IPS.includes(remote) && forwarded ? normalizeIp(forwarded) : remote;
}

/**
 * @typedef {Object} RateLimitResult
 * @property {true} allowed - Present and `true` when the hit is within the limit.
 * @property {number} [retryAfterSeconds] - Seconds until the window resets; only
 *   present when `allowed` is `false`.
 */

/**
 * @typedef {Object} RateLimiter
 * @property {(key: string) => RateLimitResult} check - Records one hit for `key`
 *   and returns whether it is within the configured limit.
 */

/**
 * Creates a fixed-window rate limiter.
 *
 * Each unique key gets its own independent counter that resets after `windowMs`.
 * The window is fixed (not sliding) — all `max` hits can be consumed at the very
 * start of a window and the counter does not roll forward.
 *
 * @param {Object} options
 * @param {number} options.max - Maximum number of hits allowed per window per key.
 * @param {number} options.windowMs - Window duration in milliseconds.
 * @returns {RateLimiter}
 */
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

/**
 * Guards a request against a rate limiter and writes a 429 response if the
 * limit is exhausted.
 *
 * The `Retry-After` header is set to the number of seconds until the window
 * resets so well-behaved clients can back off automatically.
 *
 * @param {import("node:http").ServerResponse} res - The outgoing HTTP response.
 * @param {RateLimiter} limiter - Limiter instance created by `createRateLimiter`.
 * @param {string} key - Partition key for this request (typically the client IP).
 * @returns {boolean} `true` if the request is within the limit and may proceed;
 *   `false` if the limit is exceeded (a 429 response has already been written).
 */
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

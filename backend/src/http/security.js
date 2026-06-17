/**
 * @fileoverview HTTP security-header middleware.
 *
 * Applies a strict baseline of browser-security headers to every outgoing
 * response. HSTS is omitted in non-production environments because local dev
 * runs over plain HTTP and a pinned header would make the browser refuse
 * subsequent plain-HTTP requests to localhost.
 */

import { HSTS_MAX_AGE_SECONDS, IS_PRODUCTION } from "../config.js";

// Content Security Policy. The frontend is served as static assets from this
// same origin and uses no inline scripts, so the policy can stay strict.
// 'unsafe-inline' is allowed for styles only, which the views rely on.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "img-src 'self' data:",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  // 'self' assumes this server also serves the frontend. If the API is split to a
  // separate origin, add that origin here (and to the frontend host's own CSP).
  "connect-src 'self'",
  "form-action 'self'"
].join("; ");

/**
 * Applies baseline HTTP security headers to a response.
 *
 * Headers applied unconditionally:
 * - `Content-Security-Policy` – tight policy derived from `CONTENT_SECURITY_POLICY`
 * - `X-Content-Type-Options: nosniff` – prevents MIME-type sniffing
 * - `X-Frame-Options: DENY` – disallows embedding in any frame
 * - `Referrer-Policy: no-referrer` – suppresses the Referer header on navigation
 * - `Cross-Origin-Opener-Policy: same-origin` – isolates the browsing context
 *
 * In production only:
 * - `Strict-Transport-Security` – enforces HTTPS for `HSTS_MAX_AGE_SECONDS`
 *   including subdomains. Omitted in development to avoid pinning localhost to HTTPS.
 *
 * @param {import("node:http").ServerResponse} res - The outgoing HTTP response.
 * @returns {void}
 */
export function applySecurityHeaders(res) {
  res.setHeader("content-security-policy", CONTENT_SECURITY_POLICY);
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("x-frame-options", "DENY");
  res.setHeader("referrer-policy", "no-referrer");
  res.setHeader("cross-origin-opener-policy", "same-origin");
  if (IS_PRODUCTION) {
    res.setHeader("strict-transport-security", `max-age=${HSTS_MAX_AGE_SECONDS}; includeSubDomains`);
  }
}

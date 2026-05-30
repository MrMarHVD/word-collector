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

// Apply baseline security headers to every response. HSTS is production-only
// because dev runs over plain HTTP and the header would otherwise pin browsers
// to HTTPS for localhost.
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

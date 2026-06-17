/**
 * @fileoverview Thin Sentry wrapper for error monitoring.
 *
 * Conditionally loads `@sentry/node` at runtime so the SDK is never imported in
 * environments where `SENTRY_DSN` is absent (local development, CI).  When Sentry
 * is not configured every export in this module is a no-op, meaning the rest of
 * the application never needs to guard against a missing client.
 *
 * Initialization must happen before any other module can throw (i.e. at the very
 * top of `server.js`) so that startup errors are also captured.
 */

import { NODE_ENV, SENTRY_DSN, SENTRY_TRACES_SAMPLE_RATE } from "../config.js";

// Thin wrapper around @sentry/node so the rest of the app never imports the SDK
// directly. Sentry is initialised only when SENTRY_DSN is set; otherwise every
// export here is a no-op, keeping local development and CI fully offline.
let client = null;

/**
 * Initialises the Sentry SDK.  A no-op when `SENTRY_DSN` is unset or when Sentry
 * has already been initialised.  SDK import errors are caught and logged so a
 * broken or missing package never prevents the server from starting.
 *
 * @returns {Promise<void>}
 */
export async function initSentry() {
  if (!SENTRY_DSN || client) {
    return;
  }
  try {
    const Sentry = await import("@sentry/node");
    Sentry.init({
      dsn: SENTRY_DSN,
      environment: NODE_ENV,
      tracesSampleRate: SENTRY_TRACES_SAMPLE_RATE
    });
    client = Sentry;
  } catch (error) {
    // A missing or broken SDK must never take the server down; degrade to logs.
    console.error("Sentry initialisation failed; continuing without it:", error);
  }
}

/**
 * Forwards an error to Sentry.  Safe to call unconditionally; does nothing when
 * Sentry is not configured.
 *
 * @param {unknown} error - The error or exception to report.
 */
export function captureException(error) {
  if (client) {
    client.captureException(error);
  }
}

/**
 * Flushes buffered Sentry events and tears down the client.  Should be called
 * during graceful shutdown to ensure in-flight error reports are not lost.
 * A no-op when Sentry is not configured.
 *
 * @param {number} [timeoutMs=2000] - Maximum time in milliseconds to wait for the flush.
 * @returns {Promise<void>}
 */
export async function closeSentry(timeoutMs = 2000) {
  if (client) {
    await client.close(timeoutMs);
    client = null;
  }
}

import { NODE_ENV, SENTRY_DSN, SENTRY_TRACES_SAMPLE_RATE } from "../config.js";

// Thin wrapper around @sentry/node so the rest of the app never imports the SDK
// directly. Sentry is initialised only when SENTRY_DSN is set; otherwise every
// export here is a no-op, keeping local development and CI fully offline.
let client = null;

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

// Report an unexpected error. Safe to call whether or not Sentry is configured.
export function captureException(error) {
  if (client) {
    client.captureException(error);
  }
}

// Flush buffered events before the process exits so nothing is lost on shutdown.
export async function closeSentry(timeoutMs = 2000) {
  if (client) {
    await client.close(timeoutMs);
    client = null;
  }
}

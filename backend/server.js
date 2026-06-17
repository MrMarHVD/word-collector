/**
 * @fileoverview Server bootstrap and dependency wiring.
 *
 * Initialises Sentry, builds the repository and service graph, and starts the
 * HTTP server.  All inbound traffic is handled by a single request listener that
 * applies security headers, enforces CORS, dispatches `/api/*` paths to the API
 * handler, responds to health-check probes, and falls back to static asset
 * serving for every other path.  Graceful shutdown drains in-flight connections,
 * closes the database pool, and flushes Sentry before the process exits.
 */

import { createServer } from "node:http";
import { CORS_ORIGIN, IS_PRODUCTION, PORT } from "./src/config.js";
import { db, pool } from "./src/db/index.js";
import { jsonResponse } from "./src/http/response.js";
import { serveStatic } from "./src/http/static.js";
import { applySecurityHeaders } from "./src/http/security.js";
import { createApiRequestLog } from "./src/http/api-logging.js";
import { createApiHandler } from "./src/http/routes/api.js";
import { createRepositories } from "./src/modules/index.js";
import { createEmailServiceFromConfig } from "./src/modules/email/index.js";
import { captureException, closeSentry, initSentry } from "./src/observability/sentry.js";

// Start error monitoring before anything can throw. No-op unless SENTRY_DSN is set.
await initSentry();

// The schema is managed by node-pg-migrate; run `npm run migrate:up` before
// starting the server so the tables the repositories depend on exist.
const repositories = createRepositories(db);
const emailService = createEmailServiceFromConfig();
const handleApi = createApiHandler({ repositories, emailService });

/**
 * Applies CORS response headers when the request `Origin` exactly matches the
 * single allowed origin.  The origin is echoed rather than wildcarded so that
 * `Access-Control-Allow-Credentials: true` is safe to set.
 *
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
function applyCors(req, res) {
  const origin = req.headers.origin;
  if (!origin || origin !== CORS_ORIGIN) return;
  // Echo only the single allowed origin; never reflect an arbitrary value.
  res.setHeader("access-control-allow-origin", CORS_ORIGIN);
  res.setHeader("access-control-allow-credentials", "true");
  res.setHeader("access-control-allow-methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type, x-csrf-token");
  res.setHeader("vary", "Origin");
}

/**
 * Handles `/health` and `/api/health` liveness/readiness probes.
 *
 * Runs a cheap `SELECT 1` to verify the database connection is usable, not just
 * that the process is alive.  Returns `200 { status: "ok" }` on success or
 * `503 { status: "unavailable" }` when the database is unreachable.
 *
 * @param {import("node:http").ServerResponse} res
 * @returns {Promise<void>}
 */
async function handleHealth(res) {
  try {
    await pool.query("SELECT 1");
    jsonResponse(res, 200, { status: "ok" });
  } catch (error) {
    captureException(error);
    jsonResponse(res, 503, { status: "unavailable" });
  }
}

// API requests are routed explicitly; all other paths are static app assets.
const server = createServer(async (req, res) => {
  let apiLog = null;
  try {
    applySecurityHeaders(res);
    applyCors(req, res);
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/")) {
      apiLog = createApiRequestLog(req, res, url);
    }
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    if (url.pathname === "/health" || url.pathname === "/api/health") {
      await handleHealth(res);
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }
    await serveStatic(req, res, url);
  } catch (error) {
    // Log and report the real error, but never leak its details to the client.
    if (apiLog) {
      apiLog.error(error);
    } else {
      console.error("Unhandled request error:", error);
    }
    captureException(error);
    const message = IS_PRODUCTION ? "Internal server error." : error.message || "Internal server error.";
    jsonResponse(res, 500, { error: message });
  } finally {
    if (apiLog) {
      apiLog.response();
    }
  }
});

server.listen(PORT, () => {
  console.log(`Word Marker running at http://localhost:${PORT}`);
});

// Graceful shutdown: stop accepting connections, drain in-flight requests, then
// release the database pool and flush Sentry so nothing is lost on deploy/restart.
let shuttingDown = false;
/**
 * Gracefully shuts down the server in response to a POSIX signal.
 *
 * Stops accepting new connections, waits for in-flight requests to complete,
 * then closes the database pool and flushes Sentry.  A 10-second hard timeout
 * forces a process exit if connections do not drain in time.  The `shuttingDown`
 * guard prevents concurrent invocations when both SIGTERM and SIGINT arrive.
 *
 * @param {string} signal - The signal name that triggered the shutdown (e.g. `"SIGTERM"`).
 * @returns {Promise<void>}
 */
async function shutdown(signal) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  console.log(`Received ${signal}, shutting down gracefully...`);
  server.close(async () => {
    try {
      await pool.end();
      await closeSentry();
    } catch (error) {
      console.error("Error during shutdown:", error);
    } finally {
      process.exit(0);
    }
  });
  // Force-exit if connections do not drain in time.
  setTimeout(() => {
    console.error("Shutdown timed out; forcing exit.");
    process.exit(1);
  }, 10000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

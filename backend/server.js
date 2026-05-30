import { createServer } from "node:http";
import { CORS_ORIGIN, IS_PRODUCTION, PORT } from "./src/config.js";
import { db, pool } from "./src/db/index.js";
import { jsonResponse } from "./src/http/response.js";
import { serveStatic } from "./src/http/static.js";
import { applySecurityHeaders } from "./src/http/security.js";
import { createApiHandler } from "./src/http/routes/api.js";
import { createRepositories } from "./src/modules/index.js";
import { captureException, closeSentry, initSentry } from "./src/observability/sentry.js";

// Start error monitoring before anything can throw. No-op unless SENTRY_DSN is set.
await initSentry();

// The schema is managed by node-pg-migrate; run `npm run migrate:up` before
// starting the server so the tables the repositories depend on exist.
const repositories = createRepositories(db);
const handleApi = createApiHandler({ repositories });

function applyCors(req, res) {
  const origin = req.headers.origin;
  if (!origin || origin !== CORS_ORIGIN) return;
  // Echo only the single allowed origin; never reflect an arbitrary value.
  res.setHeader("access-control-allow-origin", CORS_ORIGIN);
  res.setHeader("access-control-allow-credentials", "true");
  res.setHeader("access-control-allow-methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type");
  res.setHeader("vary", "Origin");
}

// Liveness/readiness probe for the reverse proxy and uptime monitoring. A cheap
// query confirms the database connection is actually usable, not just the process.
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
  try {
    applySecurityHeaders(res);
    applyCors(req, res);
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
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
    console.error("Unhandled request error:", error);
    captureException(error);
    const message = IS_PRODUCTION ? "Internal server error." : error.message || "Internal server error.";
    jsonResponse(res, 500, { error: message });
  }
});

server.listen(PORT, () => {
  console.log(`Word Marker running at http://localhost:${PORT}`);
});

// Graceful shutdown: stop accepting connections, drain in-flight requests, then
// release the database pool and flush Sentry so nothing is lost on deploy/restart.
let shuttingDown = false;
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

import { createServer } from "node:http";
import { CORS_ORIGIN, PORT } from "./src/config.js";
import { db } from "./src/db/index.js";
import { runMigrations } from "./src/db/migrate.js";
import { createStatements } from "./src/repositories/statements.js";
import { jsonResponse } from "./src/http/response.js";
import { serveStatic } from "./src/http/static.js";
import { createApiHandler } from "./src/http/routes/api.js";

// Bootstrap the schema before creating statements that depend on it.
runMigrations(db);

const statements = createStatements(db);
const handleApi = createApiHandler({ db, statements });

function applyCors(req, res) {
  const origin = req.headers.origin;
  if (!origin || origin !== CORS_ORIGIN) return;
  res.setHeader("access-control-allow-origin", origin);
  res.setHeader("access-control-allow-credentials", "true");
  res.setHeader("access-control-allow-methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type");
  res.setHeader("vary", "Origin");
}

// API requests are routed explicitly; all other paths are static app assets.
createServer(async (req, res) => {
  try {
    applyCors(req, res);
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }
    await serveStatic(req, res, url);
  } catch (error) {
    jsonResponse(res, 500, { error: error.message || "Internal server error." });
  }
}).listen(PORT, () => {
  console.log(`Word Marker running at http://localhost:${PORT}`);
});

import { createServer } from "node:http";
import { PORT } from "./src/config.js";
import { db } from "./src/db/index.js";
import { runMigrations } from "./src/db/migrate.js";
import { createStatements } from "./src/repositories/statements.js";
import { jsonResponse } from "./src/http/response.js";
import { serveStatic } from "./src/http/static.js";
import { createApiHandler } from "./src/routes/api.js";

runMigrations(db);

const statements = createStatements(db);
const handleApi = createApiHandler({ db, statements });

createServer(async (req, res) => {
  try {
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

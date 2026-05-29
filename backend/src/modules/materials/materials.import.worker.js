import { parentPort, workerData } from "node:worker_threads";
import { db, pool } from "../../db/index.js";
import { createRepositories } from "../index.js";
import { runMaterialImport } from "./materials.service.js";

// The import runs off the main event loop in its own worker thread, which loads
// this module fresh and therefore opens its own Postgres connection pool. The
// pool is closed in the finally block so the worker can exit cleanly.
const repositories = createRepositories(db);

try {
  await runMaterialImport(repositories, workerData);
  parentPort?.postMessage({ ok: true });
} catch (error) {
  parentPort?.postMessage({ error: error?.message || "Import failed." });
} finally {
  await pool.end();
}

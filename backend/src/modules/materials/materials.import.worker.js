import { DatabaseSync } from "node:sqlite";
import { parentPort, workerData } from "node:worker_threads";
import { DB_PATH } from "../../config.js";
import { createRepositories } from "../index.js";
import { runMaterialImport } from "./materials.service.js";

// The import runs off the main event loop. WAL is already enabled on the file
// by the primary connection, so this writer coexists with the main reader;
// busy_timeout absorbs brief contention while batches commit.
const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA busy_timeout = 5000");

const repositories = createRepositories(db);

try {
  await runMaterialImport(repositories, workerData);
  parentPort?.postMessage({ ok: true });
} catch (error) {
  parentPort?.postMessage({ error: error?.message || "Import failed." });
} finally {
  db.close();
}

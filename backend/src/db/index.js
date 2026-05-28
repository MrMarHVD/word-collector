import { mkdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { DATA_DIR, DB_PATH } from "../config.js";

// One process-local SQLite connection backs the repositories.
await mkdir(DATA_DIR, { recursive: true });

export const db = new DatabaseSync(DB_PATH);

// WAL lets the import worker thread write progress while the main connection
// keeps serving reads; busy_timeout absorbs brief writer contention.
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA busy_timeout = 5000");

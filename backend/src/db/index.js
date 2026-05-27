import { mkdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { DATA_DIR, DB_PATH } from "../config.js";

// One process-local SQLite connection backs the repositories.
await mkdir(DATA_DIR, { recursive: true });

export const db = new DatabaseSync(DB_PATH);

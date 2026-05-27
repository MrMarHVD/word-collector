import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Central runtime paths and fixed product options shared by server modules.
export const PORT = Number(process.env.PORT || 3000);
export const BACKEND_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const ROOT = resolve(BACKEND_ROOT, "..");
export const PUBLIC_DIR = process.env.PUBLIC_DIR || join(ROOT, "frontend", "public");
export const DATA_DIR = process.env.WORD_MARKER_DATA_DIR || join(ROOT, "data");
export const DB_PATH = join(DATA_DIR, "words.db");
export const JWT_SECRET_PATH = join(DATA_DIR, "jwt.secret");
export const AUTH_COOKIE = "word_collector_token";
export const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:5173";
export const JWT_TTL_SECONDS = 7 * 24 * 60 * 60;
export const SEED_EMAIL = "havardjvd@gmail.com";
export const SEED_PASSWORD = "MelkeMannen22";
export const NATIVE_LANGUAGE_OPTIONS = ["English", "Japanese", "Chinese"];
export const STUDY_LANGUAGE_OPTIONS = ["English", "Japanese", "Chinese"];
export const READER_WORK_PAGE_SIZE = 50;

// EPUB import diagnostics. Set via the EPUB_IMPORT_LOG env var.
//   "off"      — disabled (default)
//   "stdout"   — write to the server's stdout
//   <path>     — append to the given file (relative paths resolve to project root)
export const EPUB_IMPORT_LOG = process.env.EPUB_IMPORT_LOG || "off";

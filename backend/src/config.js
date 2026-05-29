import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";

// Central runtime paths and fixed product options shared by server modules.
export const BACKEND_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const ROOT = resolve(BACKEND_ROOT, "..");

// Load environment variables from a project-root .env file when present.
// Real environment variables always take precedence over the file.
try {
  process.loadEnvFile(join(ROOT, ".env"));
} catch {
  // No .env file: rely on the ambient environment.
}

export const NODE_ENV = process.env.NODE_ENV || "development";
export const IS_PRODUCTION = NODE_ENV === "production";

// Read a required variable, failing fast when it is missing.
function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const PORT = Number(process.env.PORT || 3000);
export const PUBLIC_DIR = process.env.PUBLIC_DIR || join(ROOT, "frontend", "public");
export const DATA_DIR = process.env.WORD_MARKER_DATA_DIR || join(ROOT, "data");
export const AUTH_COOKIE = "word_collector_token";

// Postgres connection string. Required in production; defaults to the local
// development cluster otherwise.
export const DATABASE_URL = process.env.DATABASE_URL
  || (IS_PRODUCTION ? requireEnv("DATABASE_URL") : "postgres://localhost:5432/word_marker");
export const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:5173";
export const JWT_TTL_SECONDS = 7 * 24 * 60 * 60;

// JWT signing secret. Required in production; in development we fall back to a
// generated, file-persisted secret so local restarts keep sessions valid.
const JWT_SECRET_PATH = join(DATA_DIR, "jwt.secret");
function resolveJwtSecret() {
  if (process.env.JWT_SECRET) {
    return process.env.JWT_SECRET;
  }
  if (IS_PRODUCTION) {
    return requireEnv("JWT_SECRET");
  }
  if (existsSync(JWT_SECRET_PATH)) {
    return readFileSync(JWT_SECRET_PATH, "utf8").trim();
  }
  const secret = randomBytes(48).toString("base64url");
  writeFileSync(JWT_SECRET_PATH, `${secret}\n`, { mode: 0o600 });
  console.warn("JWT_SECRET is not set; generated a development secret at data/jwt.secret. Set JWT_SECRET for production.");
  return secret;
}
export const JWT_SECRET = resolveJwtSecret();

export const NATIVE_LANGUAGE_OPTIONS = ["English", "Japanese", "Chinese"];
export const STUDY_LANGUAGE_OPTIONS = ["English", "Japanese", "Chinese", "Spanish", "French"];
export const ENGLISH_NATIVE_ONLY_STUDY_LANGUAGES = ["Spanish", "French"];
export const READER_WORK_PAGE_SIZE = 50;

// EPUB import diagnostics. Set via the EPUB_IMPORT_LOG env var.
//   "off"      — disabled (default)
//   "stdout"   — write to the server's stdout
//   <path>     — append to the given file (relative paths resolve to project root)
export const EPUB_IMPORT_LOG = process.env.EPUB_IMPORT_LOG || "off";

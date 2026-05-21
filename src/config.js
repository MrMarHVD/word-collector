import { join } from "node:path";

export const PORT = Number(process.env.PORT || 3000);
export const ROOT = process.cwd();
export const PUBLIC_DIR = join(ROOT, "public");
export const DATA_DIR = join(ROOT, "data");
export const DB_PATH = join(DATA_DIR, "words.db");
export const JWT_SECRET_PATH = join(DATA_DIR, "jwt.secret");
export const AUTH_COOKIE = "word_collector_token";
export const JWT_TTL_SECONDS = 7 * 24 * 60 * 60;
export const SEED_EMAIL = "havardjvd@gmail.com";
export const SEED_PASSWORD = "MelkeMannen22";

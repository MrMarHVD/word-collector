/**
 * @fileoverview Static file server for the compiled frontend.
 *
 * Serves files from the configured `PUBLIC_DIR`. Any path that resolves outside
 * that directory (path-traversal attempts) or that does not correspond to an
 * existing file falls back to `index.html`, enabling client-side routing in the
 * single-page application, except under the versioned asset prefixes
 * (`/assets/`, `/vendor/`, `/models/`), which return a real 404. Files are streamed so large
 * translation-model binaries are never buffered whole in memory.
 */

import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve } from "node:path";
import { pipeline } from "node:stream";
import { PUBLIC_DIR } from "../config.js";
import { textResponse } from "./response.js";

// Serve the build output and reject normalized paths that escape that directory.
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
  ".md": "text/markdown; charset=utf-8",
  ".bin": "application/octet-stream",
  ".spm": "application/octet-stream"
};
const publicRoot = resolve(PUBLIC_DIR);
// Asset prefixes that never fall back to index.html. A missing `/assets/` chunk
// (a tab still on a deleted build) must fail as a real 404, not as HTML.
const NO_FALLBACK_PREFIXES = ["/assets/", "/vendor/", "/models/"];
// Versioned asset prefixes whose contents never change at a given URL
// (`/assets/` holds Vite's content-hashed build output).
const IMMUTABLE_PREFIXES = ["/assets/", "/vendor/bergamot-0.4.9/", "/models/"];
// index.html references the current hashed assets, so it must be revalidated on every load.
const NO_CACHE = "no-cache";

/**
 * Stats a path and returns it only when it is a regular file.
 *
 * @param {string} filePath - Absolute path to check.
 * @returns {Promise<import("node:fs").Stats | null>} File stats, or null when missing or not a file.
 */
async function statFile(filePath) {
  try {
    const stats = await stat(filePath);
    return stats.isFile() ? stats : null;
  } catch {
    return null;
  }
}

/**
 * Resolves and serves a static file from `PUBLIC_DIR`.
 *
 * Resolution rules:
 * - `/` maps to `/index.html`.
 * - Any path whose resolved form escapes `PUBLIC_DIR` (traversal) falls back
 *   to `index.html` with a 200 status rather than returning a 403/404, which
 *   preserves SPA deep-link navigation for unknown routes.
 * - Non-existent paths fall back to `index.html` for the same reason, except
 *   under `/assets/`, `/vendor/` and `/models/`, which return a plain-text 404.
 * - When `index.html` itself is missing (no frontend build), the fallback
 *   answers with a plain-text 503 instead of an unhandled 500.
 * - Known extensions (`.html`, `.css`, `.js`, `.json`, `.wasm`, images, `.webmanifest`,
 *   `.md`, `.bin`, `.spm`) get the correct MIME type; everything else receives
 *   `application/octet-stream`.
 * - Files under `/assets/`, `/vendor/bergamot-0.4.9/` and `/models/` are cached as
 *   immutable; `index.html` and the SPA fallback are sent with `no-cache`.
 *
 * @param {import("node:http").IncomingMessage} req - The incoming HTTP request (unused; kept for
 *   a consistent server-handler signature).
 * @param {import("node:http").ServerResponse} res - The outgoing HTTP response.
 * @param {URL} url - Pre-parsed request URL used to extract `pathname`.
 * @returns {Promise<void>}
 */
export async function serveStatic(req, res, url) {
  const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = resolve(publicRoot, `.${requestedPath}`);
  const pathFromRoot = relative(publicRoot, filePath);
  const stats = pathFromRoot.startsWith("..") || isAbsolute(pathFromRoot) ? null : await statFile(filePath);

  if (!stats) {
    if (NO_FALLBACK_PREFIXES.some((prefix) => requestedPath.startsWith(prefix))) {
      textResponse(res, 404, "Not found");
      return;
    }
    const indexPath = resolve(publicRoot, "index.html");
    const content = await readFile(indexPath).catch((error) => {
      if (error.code === "ENOENT") {
        return null;
      }
      throw error;
    });
    if (!content) {
      textResponse(res, 503, "Frontend build missing. Run `npm run build -w frontend`.");
      return;
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": NO_CACHE });
    res.end(content);
    return;
  }

  const headers = {
    "content-type": mimeTypes[extname(filePath)] || "application/octet-stream",
    "content-length": stats.size
  };
  if (IMMUTABLE_PREFIXES.some((prefix) => requestedPath.startsWith(prefix))) {
    headers["cache-control"] = "public, max-age=31536000, immutable";
  } else if (requestedPath === "/index.html") {
    headers["cache-control"] = NO_CACHE;
  }
  res.writeHead(200, headers);
  // Headers are already sent, so a read error can only abort the response;
  // pipeline also destroys the file stream when the client disconnects.
  pipeline(createReadStream(filePath), res, () => {});
}

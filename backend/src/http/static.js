/**
 * @fileoverview Static file server for the compiled frontend.
 *
 * Serves files from the configured `PUBLIC_DIR`. Any path that resolves outside
 * that directory (path-traversal attempts) or that does not correspond to an
 * existing file falls back to `index.html`, enabling client-side routing in the
 * single-page application. MIME types are limited to the four extensions the
 * build produces; anything else is served as `application/octet-stream`.
 */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve } from "node:path";
import { PUBLIC_DIR } from "../config.js";
import { textResponse } from "./response.js";

// Serve public/ files and reject normalized paths that escape that directory.
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};
const publicRoot = resolve(PUBLIC_DIR);

/**
 * Resolves and serves a static file from `PUBLIC_DIR`.
 *
 * Resolution rules:
 * - `/` maps to `/index.html`.
 * - Any path whose resolved form escapes `PUBLIC_DIR` (traversal) falls back
 *   to `index.html` with a 200 status rather than returning a 403/404, which
 *   preserves SPA deep-link navigation for unknown routes.
 * - Non-existent paths fall back to `index.html` for the same reason.
 * - Known extensions (`.html`, `.css`, `.js`, `.json`) get the correct MIME type;
 *   everything else receives `application/octet-stream`.
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

  if (pathFromRoot.startsWith("..") || isAbsolute(pathFromRoot) || !existsSync(filePath)) {
    const indexPath = resolve(publicRoot, "index.html");
    const content = await readFile(indexPath);
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(content);
    return;
  }

  const content = await readFile(filePath);
  res.writeHead(200, {
    "content-type": mimeTypes[extname(filePath)] || "application/octet-stream"
  });
  res.end(content);
}

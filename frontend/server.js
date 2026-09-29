/**
 * @fileoverview Minimal static-file server for the Word Marker frontend SPA.
 *
 * Serves the `public/` directory over HTTP with the production Content Security
 * Policy, streams files, and handles these special cases:
 *   - `GET /env.js` — injects the runtime API base URL as a JS global so the
 *     client bundle can reach the backend without a build step.
 *   - Extension-less paths (client-side routes) — fall back to `index.html` so
 *     deep links and browser refreshes resolve correctly instead of returning 404.
 *     Paths under `/vendor/` and `/models/` never fall back and return 404.
 *   - `/vendor/bergamot-0.4.9/` and `/models/` — versioned assets, cached as immutable.
 *
 * Configuration is driven by environment variables:
 *   - `PORT` — listening port (default `5173`).
 *   - `API_BASE_URL` — backend origin forwarded to the browser (default `http://localhost:3000`).
 */

import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { dirname, extname, join, normalize } from "node:path";
import { pipeline } from "node:stream";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.PORT || 5173);
const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:3000";
const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), "public");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".bin": "application/octet-stream",
  ".spm": "application/octet-stream"
};
// Asset prefixes that never fall back to index.html.
const NO_FALLBACK_PREFIXES = ["/vendor/", "/models/"];
// Versioned asset prefixes whose contents never change at a given URL.
const IMMUTABLE_PREFIXES = ["/vendor/bergamot-0.4.9/", "/models/"];

// Mirrors CONTENT_SECURITY_POLICY in backend/src/http/security.js so policy
// regressions show up in dev; keep them in sync. The only difference is that
// connect-src also allows the separate dev API origin.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "img-src 'self' data:",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  `connect-src 'self' ${new URL(API_BASE_URL).origin}`,
  "form-action 'self'"
].join("; ");

/**
 * Write a plain-text (or custom MIME) response and end the stream.
 *
 * @param {import("node:http").ServerResponse} res - The HTTP response object.
 * @param {number} status - HTTP status code to send.
 * @param {string} body - Response body string.
 * @param {string} [type="text/plain; charset=utf-8"] - Content-Type header value.
 * @returns {void}
 */
function sendText(res, status, body, type = "text/plain; charset=utf-8") {
  res.writeHead(status, { "content-type": type });
  res.end(body);
}

/**
 * Stat a path and return it only when it is a regular file.
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

createServer(async (req, res) => {
  res.setHeader("content-security-policy", CONTENT_SECURITY_POLICY);
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  if (url.pathname === "/env.js") {
    sendText(res, 200, `window.WORD_MARKER_API_BASE_URL = ${JSON.stringify(API_BASE_URL)};`, "text/javascript; charset=utf-8");
    return;
  }

  const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = normalize(join(PUBLIC_DIR, requestedPath));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendText(res, 404, "Not found");
    return;
  }

  // Serve the SPA shell for client-side routes (extension-less paths) so deep
  // links and refreshes resolve to index.html instead of 404.
  let resolvedPath = filePath;
  let stats = await statFile(resolvedPath);
  if (!stats) {
    if (extname(requestedPath) === "" && !NO_FALLBACK_PREFIXES.some((prefix) => requestedPath.startsWith(prefix))) {
      resolvedPath = join(PUBLIC_DIR, "index.html");
      stats = await statFile(resolvedPath);
    } else {
      sendText(res, 404, "Not found");
      return;
    }
  }

  const headers = {
    "content-type": mimeTypes[extname(resolvedPath)] || "application/octet-stream",
    "content-length": stats.size
  };
  if (IMMUTABLE_PREFIXES.some((prefix) => requestedPath.startsWith(prefix))) {
    headers["cache-control"] = "public, max-age=31536000, immutable";
  }
  res.writeHead(200, headers);
  // Headers are already sent, so a read error can only abort the response;
  // pipeline also destroys the file stream when the client disconnects.
  pipeline(createReadStream(resolvedPath), res, () => {});
}).listen(PORT, () => {
  console.log(`Word Marker web running at http://localhost:${PORT}`);
});

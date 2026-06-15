/**
 * @fileoverview Minimal static-file server for the Word Marker frontend SPA.
 *
 * Serves the `public/` directory over HTTP and handles two special cases:
 *   - `GET /env.js` — injects the runtime API base URL as a JS global so the
 *     client bundle can reach the backend without a build step.
 *   - Extension-less paths (client-side routes) — fall back to `index.html` so
 *     deep links and browser refreshes resolve correctly instead of returning 404.
 *
 * Configuration is driven by environment variables:
 *   - `PORT` — listening port (default `5173`).
 *   - `API_BASE_URL` — backend origin forwarded to the browser (default `http://localhost:3000`).
 */

import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.PORT || 5173);
const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:3000";
const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), "public");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

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

createServer(async (req, res) => {
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
  if (!existsSync(resolvedPath)) {
    if (extname(requestedPath) === "") {
      resolvedPath = join(PUBLIC_DIR, "index.html");
    } else {
      sendText(res, 404, "Not found");
      return;
    }
  }

  const content = await readFile(resolvedPath);
  res.writeHead(200, {
    "content-type": mimeTypes[extname(resolvedPath)] || "application/octet-stream"
  });
  res.end(content);
}).listen(PORT, () => {
  console.log(`Word Marker web running at http://localhost:${PORT}`);
});

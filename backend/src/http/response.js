/**
 * @fileoverview Minimal response-writing helpers for the raw Node.js HTTP server.
 *
 * These thin wrappers exist because the project uses Node's built-in `http`
 * module without a framework. They centralise header boilerplate so route
 * handlers stay readable.
 */

/**
 * Serializes `payload` to JSON and ends the response.
 *
 * Sets `Content-Type: application/json` and a precise `Content-Length` header
 * so keep-alive connections are not prematurely closed.
 *
 * @param {import("node:http").ServerResponse} res - The outgoing HTTP response.
 * @param {number} status - HTTP status code (e.g. 200, 400, 404).
 * @param {unknown} payload - Value to serialize; must be JSON-serializable.
 * @returns {void}
 */
export function jsonResponse(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body)
  });
  res.end(body);
}

/**
 * Sends a plain-text response, used primarily by the static file server for
 * simple error messages (e.g., 404 when a requested path is not found).
 *
 * @param {import("node:http").ServerResponse} res - The outgoing HTTP response.
 * @param {number} status - HTTP status code.
 * @param {string} body - UTF-8 text body.
 * @returns {void}
 */
export function textResponse(res, status, body) {
  res.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  res.end(body);
}

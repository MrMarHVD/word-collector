/**
 * @fileoverview Request-body reading helpers for API route handlers.
 *
 * All helpers enforce an upper-bound on body size to prevent memory exhaustion
 * from oversized requests. Parsing is intentionally dependency-free — the server
 * uses Node's built-in `http` module, so no framework body-parser is available.
 */

/**
 * Reads and JSON-parses the full request body, enforcing a 2 MB limit.
 *
 * An empty body returns `{}` rather than throwing a parse error, which avoids
 * requiring callers to send a `{}` payload for endpoints that make body fields
 * optional.
 *
 * @param {import("node:http").IncomingMessage} req - The incoming HTTP request.
 * @returns {Promise<Record<string, unknown>>} Parsed JSON object.
 * @throws {Error} If the body exceeds 2 MB or contains invalid JSON.
 */
export async function readJson(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 2_000_000) {
      throw new Error("Request body is too large.");
    }
  }
  return raw ? JSON.parse(raw) : {};
}

/**
 * Streams the full request body into a single `Buffer` up to `maxBytes`.
 *
 * Used as the low-level primitive by `readMultipart` for file uploads. Callers
 * that need raw binary content (e.g. file parsing before MIME detection) can
 * call this directly.
 *
 * @param {import("node:http").IncomingMessage} req - The incoming HTTP request.
 * @param {number} [maxBytes=40_000_000] - Maximum allowed body size in bytes (default 40 MB).
 * @returns {Promise<Buffer>} Complete body as a single concatenated buffer.
 * @throws {Error} If the body exceeds `maxBytes`.
 */
export async function readBuffer(req, maxBytes = 40_000_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) {
      throw new Error("Request body is too large.");
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/**
 * @typedef {Object} MultipartFile
 * @property {string} filename - Original filename from the `Content-Disposition` header.
 * @property {string} type - MIME type from `Content-Type`, or `"application/octet-stream"` if absent.
 * @property {Buffer} buffer - Raw file bytes.
 */

/**
 * @typedef {Object} MultipartResult
 * @property {Record<string, string>} fields - Non-file form fields keyed by field name.
 * @property {Record<string, MultipartFile>} files - File parts keyed by field name.
 */

/**
 * Parses a `multipart/form-data` request body into plain fields and file buffers.
 *
 * The parser handles the simple `FormData` shape emitted by the browser's fetch
 * API for material uploads. Nested or repeated field names are not supported
 * — the last value wins for duplicates.
 *
 * @param {import("node:http").IncomingMessage} req - The incoming HTTP request. Must have a
 *   `Content-Type` header containing a `boundary` parameter.
 * @param {number} [maxBytes=40_000_000] - Maximum total body size in bytes (default 40 MB).
 * @returns {Promise<MultipartResult>} Parsed fields and files.
 * @throws {Error} If the `boundary` parameter is missing, or the body exceeds `maxBytes`.
 */
export async function readMultipart(req, maxBytes = 40_000_000) {
  const contentType = req.headers["content-type"] || "";
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!boundaryMatch) {
    throw new Error("Multipart boundary is missing.");
  }

  const boundary = Buffer.from(`--${boundaryMatch[1] || boundaryMatch[2]}`);
  const body = await readBuffer(req, maxBytes);
  const fields = {};
  const files = {};
  let offset = 0;

  // Parse the simple browser FormData shape used by material uploads.
  while (offset < body.length) {
    const boundaryStart = body.indexOf(boundary, offset);
    if (boundaryStart === -1) break;
    const partStart = boundaryStart + boundary.length;
    if (body.slice(partStart, partStart + 2).toString() === "--") break;
    const headersStart = partStart + 2;
    const headersEnd = body.indexOf(Buffer.from("\r\n\r\n"), headersStart);
    if (headersEnd === -1) break;

    const headers = body.slice(headersStart, headersEnd).toString("utf8");
    const nextBoundary = body.indexOf(boundary, headersEnd + 4);
    if (nextBoundary === -1) break;
    const content = body.slice(headersEnd + 4, Math.max(headersEnd + 4, nextBoundary - 2));
    const disposition = headers.match(/content-disposition:\s*form-data;([^\r\n]+)/i)?.[1] || "";
    const name = disposition.match(/name="([^"]+)"/i)?.[1];
    const filename = disposition.match(/filename="([^"]*)"/i)?.[1];
    const type = headers.match(/content-type:\s*([^\r\n]+)/i)?.[1]?.trim() || "application/octet-stream";

    if (name && filename !== undefined) {
      files[name] = { filename, type, buffer: content };
    } else if (name) {
      fields[name] = content.toString("utf8");
    }
    offset = nextBoundary;
  }

  return { fields, files };
}

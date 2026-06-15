/**
 * @fileoverview Structured JSON request/response logging for the API layer.
 *
 * Each request receives a UUID written into `X-Request-Id` so that the
 * inbound log line, any intermediate error, and the final response log can be
 * correlated in a log aggregator. All output is newline-delimited JSON written
 * to the appropriate stdio stream (`console.info` / `console.warn` / `console.error`).
 *
 * Log levels follow HTTP status ranges: 5xx → error, 4xx → warn, 2xx/3xx → info.
 */

import { randomUUID } from "node:crypto";
import { clientIp } from "./rate-limit.js";

function log(level, event) {
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    ...event
  });
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.info(line);
  }
}

function responseLogLevel(status) {
  if (status >= 500) return "error";
  if (status >= 400) return "warn";
  return "info";
}

/**
 * @typedef {Object} ApiRequestLog
 * @property {(error: unknown) => void} error - Logs an unhandled error with message and stack
 *   at `error` level. Should be called from the global error handler before the 500 response is sent.
 * @property {() => void} response - Logs the completed response (status + duration) at the
 *   level appropriate for the HTTP status code. Should be called after `res.end()`.
 */

/**
 * Starts structured logging for a single API request.
 *
 * Immediately emits an `api.request` log line and writes a `X-Request-Id` header
 * onto the response so the client can include it in bug reports. Returns two
 * callbacks — `error` and `response` — that emit the corresponding terminal log
 * lines when called.
 *
 * The start timestamp is captured with `performance.now()` so that `response()`
 * can report duration to 0.1 ms precision regardless of wall-clock drift.
 *
 * @param {import("node:http").IncomingMessage} req - The incoming HTTP request.
 * @param {import("node:http").ServerResponse} res - The outgoing HTTP response. `X-Request-Id`
 *   is set as a side effect.
 * @param {URL} url - Pre-parsed request URL (used to extract `pathname`).
 * @returns {ApiRequestLog} Object with `error` and `response` logging callbacks.
 */
export function createApiRequestLog(req, res, url) {
  const requestId = randomUUID();
  const startedAt = performance.now();
  const path = url.pathname;
  const method = req.method || "UNKNOWN";

  res.setHeader("x-request-id", requestId);

  log("info", {
    type: "api.request",
    requestId,
    method,
    path,
    ip: clientIp(req)
  });

  return {
    error(error) {
      log("error", {
        type: "api.error",
        requestId,
        method,
        path,
        status: res.statusCode || 500,
        error: error?.message || String(error),
        stack: error?.stack
      });
    },
    response() {
      const status = res.statusCode || 200;
      log(responseLogLevel(status), {
        type: "api.response",
        requestId,
        method,
        path,
        status,
        durationMs: Math.round((performance.now() - startedAt) * 10) / 10
      });
    }
  };
}

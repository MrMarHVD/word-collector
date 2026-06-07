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

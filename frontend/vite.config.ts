/**
 * Vite configuration for the React frontend.
 *
 * - Dev server port comes from `PORT` (default 5173) and `/api` is proxied to
 *   `API_PROXY_TARGET` (default http://localhost:3000), so the app and the API
 *   share one origin and no runtime `env.js` is needed.
 * - `static/` is the public dir: the versioned Bergamot engine under
 *   `/vendor/bergamot-0.4.9/`, the favicon and the no-flash theme script.
 * - The translation models stay in `public/models/` (gitignored, written by
 *   `backend/scripts/fetch_mt_models.js`). The `translationModels` plugin
 *   serves them at `/models/*` in dev/preview and copies them into the build
 *   output, which the backend serves in production.
 */

import { cpSync, createReadStream, existsSync, statSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 5173);
const API_PROXY_TARGET = process.env.API_PROXY_TARGET || "http://localhost:3000";
const STATIC_DIR = join(ROOT, "static");
const MODELS_DIR = join(ROOT, "public", "models");
const OUT_DIR = join(ROOT, "dist");

type Next = (error?: unknown) => void;

/** Returns the file inside `baseDir` for a URL sub-path, or null when missing or outside it. */
function resolveFile(baseDir: string, subPath: string): string | null {
  const filePath = join(baseDir, decodeURIComponent(subPath));
  const pathFromBase = relative(baseDir, filePath);
  // Same containment check as backend/src/http/static.js: a prefix match would admit siblings like "models-x".
  if (pathFromBase.startsWith("..") || isAbsolute(pathFromBase)) {
    return null;
  }
  return existsSync(filePath) && statSync(filePath).isFile() ? filePath : null;
}

/**
 * Serves `/models/*` from MODELS_DIR (immutable, like the backend) and
 * returns real 404s for missing `/vendor/*` and `/models/*` files instead of
 * the SPA fallback.
 */
function assetMiddleware(req: IncomingMessage, res: ServerResponse, next: Next): void {
  const pathname = (req.url || "/").split("?")[0] ?? "/";
  if (pathname.startsWith("/vendor/")) {
    if (resolveFile(STATIC_DIR, pathname)) {
      next();
      return;
    }
    res.statusCode = 404;
    res.end("Not found");
    return;
  }
  if (!pathname.startsWith("/models/")) {
    next();
    return;
  }
  const filePath = resolveFile(MODELS_DIR, pathname.slice("/models/".length));
  if (!filePath) {
    res.statusCode = 404;
    res.end("Not found");
    return;
  }
  res.writeHead(200, {
    "content-type": "application/octet-stream",
    "content-length": statSync(filePath).size,
    "cache-control": "public, max-age=31536000, immutable"
  });
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  createReadStream(filePath).pipe(res);
}

/** Makes the gitignored translation models available at `/models/*` in dev, preview and the build output. */
function translationModels(): Plugin {
  // Follows `--outDir`, which deploy uses to build into a fresh directory.
  // Only `vite build` copies; Vitest also closes the bundle, with a dummy outDir.
  let outDir = OUT_DIR;
  let isBuild = false;
  return {
    name: "supergloss:translation-models",
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
      isBuild = config.command === "build" && !process.env.VITEST;
    },
    configureServer(server) {
      server.middlewares.use(assetMiddleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(assetMiddleware);
    },
    closeBundle() {
      if (!isBuild) {
        return;
      }
      if (!existsSync(MODELS_DIR)) {
        this.warn(`No translation models at ${MODELS_DIR}; run \`npm run fetch:mt-models -w backend\`.`);
        return;
      }
      cpSync(MODELS_DIR, join(outDir, "models"), { recursive: true });
    }
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), translationModels()],
  publicDir: STATIC_DIR,
  resolve: {
    alias: { "@": resolve(ROOT, "src") }
  },
  server: {
    port: PORT,
    strictPort: true,
    proxy: {
      "/api": { target: API_PROXY_TARGET, changeOrigin: false }
    }
  },
  preview: {
    port: PORT,
    strictPort: true,
    proxy: {
      "/api": { target: API_PROXY_TARGET, changeOrigin: false }
    }
  },
  build: {
    outDir: OUT_DIR,
    emptyOutDir: true
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"]
  }
});

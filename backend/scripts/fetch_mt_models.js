/**
 * @file fetch_mt_models.js
 * @description Downloads the pinned Bergamot machine-translation model files into
 * `frontend/public/models/`, so the browser can load them from the app's own origin.
 * Mozilla's CDN sends no CORS headers, which is why the files are self-hosted.
 *
 * Pinned models: Mozilla Firefox Translations ja→en and zh-Hans→en v2.1, taken
 * from the Remote Settings `translations-models` collection. Each file is verified against its
 * pinned size and SHA-256.
 *
 * The script is idempotent: files already present with the correct hash are
 * skipped. Downloads go to a temporary `.part` file that is only renamed into
 * place after verification, so a failed run never leaves a corrupt model behind.
 *
 * CLI usage:
 * ```
 * node backend/scripts/fetch_mt_models.js
 * ```
 * Exits non-zero on a download failure or size/hash mismatch.
 */
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

// Download and verify the pinned translation models into the public folder.
const BASE_URL = "https://firefox-settings-attachments.cdn.mozilla.net/";
// Resolved locally rather than via config.js, which requires runtime secrets.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MODELS_DIR = join(ROOT, "frontend", "public", "models");
const MODELS = [
  {
    dir: "ja-en-2.1",
    files: [
      {
        name: "model.bin",
        path: "main-workspace/translations-models/2b066368-11b5-4cee-92e8-e6156b334f80.bin",
        size: 43977787,
        sha256: "3a603e20bfe1be86071913f9e23ab5129075bc0a8490151020ac4821e4f17302"
      },
      {
        name: "lex.bin",
        path: "main-workspace/translations-models/4e6b3270-8a2f-491d-b717-f99749328622.bin",
        size: 9348172,
        sha256: "525f412f0d210536c2933c78ae395fa0bf2b5ee6cc5dda61ebc2e79410ebaee4"
      },
      {
        name: "vocab.spm",
        path: "main-workspace/translations-models/6f4898e3-ebaa-4a79-a1af-93a4f65b96fa.spm",
        size: 1443222,
        sha256: "5cb217758bae05877bb3f0c2f612e4e7c1e4cb03c10db11f4a47098d7ae62919"
      }
    ]
  },
  {
    dir: "zh-en-2.1",
    files: [
      {
        name: "model.bin",
        path: "main-workspace/translations-models/715efbde-c974-4696-981a-83c0c5f82ad5.bin",
        size: 43977787,
        sha256: "5cd149601802fc8a18124a1c1306144dbbedc058630c4ddb2d53aa76fa9c7c06"
      },
      {
        name: "lex.bin",
        path: "main-workspace/translations-models/ae5f53d2-59ec-4aad-944d-999e50d6a65c.bin",
        size: 9219192,
        sha256: "8524dd4c93ffd7f0ae7be32f77a7c14fea7cdbbebe34ea6ad0ec368d5ddd8b13"
      },
      {
        name: "vocab.spm",
        path: "main-workspace/translations-models/17ff5d42-6d4c-42f8-ad3c-b8042b5bafa7.spm",
        size: 1359697,
        sha256: "dff594318ab7d8b7b60b844ab98ebe6b932ae8045fab15235404c787715965b3"
      }
    ]
  }
];

/**
 * Compute the SHA-256 hex digest of a file by streaming it.
 *
 * @param {string} path - Absolute file path.
 * @returns {Promise<string>} Lowercase hex digest.
 */
async function sha256File(path) {
  const hash = createHash("sha256");
  await pipeline(createReadStream(path), hash);
  return hash.digest("hex");
}

/**
 * Check whether a file exists with the expected size and SHA-256.
 *
 * @param {string} path - Absolute file path.
 * @param {{ size: number, sha256: string }} expected - Pinned size and digest.
 * @returns {Promise<boolean>} True when the file is present and matches.
 */
async function isVerified(path, expected) {
  if (!existsSync(path)) return false;
  const { size } = await stat(path);
  return size === expected.size && (await sha256File(path)) === expected.sha256;
}

/**
 * Download one model file to a temporary path, verify it, and move it into place.
 *
 * @param {{ name: string, path: string, size: number, sha256: string }} file - Pinned file entry.
 * @param {string} targetPath - Final absolute path of the file.
 * @returns {Promise<void>}
 * @throws {Error} When the download fails or the size/hash does not match.
 */
async function download(file, targetPath) {
  const partPath = `${targetPath}.part`;
  const response = await fetch(new URL(file.path, BASE_URL));
  if (!response.ok || !response.body) {
    throw new Error(`Download failed for ${file.name}: HTTP ${response.status}`);
  }
  try {
    await pipeline(Readable.fromWeb(response.body), createWriteStream(partPath));
    const { size } = await stat(partPath);
    if (size !== file.size) {
      throw new Error(`Size mismatch for ${file.name}: expected ${file.size}, got ${size}`);
    }
    const digest = await sha256File(partPath);
    if (digest !== file.sha256) {
      throw new Error(`SHA-256 mismatch for ${file.name}: expected ${file.sha256}, got ${digest}`);
    }
    await rename(partPath, targetPath);
  } finally {
    await rm(partPath, { force: true });
  }
}

const summary = { downloaded: [], skipped: [] };
try {
  for (const model of MODELS) {
    const modelDir = join(MODELS_DIR, model.dir);
    await mkdir(modelDir, { recursive: true });
    for (const file of model.files) {
      const targetPath = join(modelDir, file.name);
      const label = `${model.dir}/${file.name}`;
      if (await isVerified(targetPath, file)) {
        summary.skipped.push(label);
        continue;
      }
      await download(file, targetPath);
      summary.downloaded.push(label);
    }
  }
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

console.log(JSON.stringify(summary, null, 2));

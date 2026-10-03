/**
 * @fileoverview Route handlers for the `/api/materials` resource.
 *
 * Materials are documents (e.g. PDFs, text files) that a user uploads to a
 * study language. The reader endpoint streams paginated sentences/paragraphs
 * from a processed material so the frontend can display them word-by-word.
 */

import { getMaterialReader, getMaterials, markMaterialOpened, startMaterialImport, updateMaterial } from "../../modules/materials/materials.service.js";
import { effectiveUploadBytesForUser } from "../../modules/admin/admin-users.service.js";
import { readJson, readMultipart } from "../request.js";
import { jsonResponse } from "../response.js";

/**
 * Creates the route handler for `/api/materials` and `/api/materials/:id`.
 *
 * **GET /api/materials?languageId=&[offset=]&[search=]&[category=all|uncategorised|<id>]**
 * Lists materials for a language, paginated (page size 50), sorted by last
 * opened (never-opened last), then date added. Each item includes `categoryId`,
 * `lastOpenedAt`, `readTokens` and `totalTokens`.
 * - Response 200: `{ materials: Material[], pageSize: 50 }`
 * - Response 400: `category` is not `all`, `uncategorised` or a number.
 * - Response 404: language or category not found or not owned by the user.
 *
 * **POST /api/materials** _(multipart/form-data)_
 * Uploads a new document file and begins background import processing.
 * - Body fields: `languageId` (string-encoded number), `file` (binary file part).
 * - Response 201: import result from `startMaterialImport`.
 * - Response 400: service-level validation error.
 * - Response 413: file exceeds the beta upload limit (`BETA_MAX_MATERIAL_UPLOAD_BYTES`).
 *
 * **GET /api/materials/:id?[start=]&[limit=]**
 * Returns a paginated reader view of a material's processed content.
 * - Response 200: reader payload from `getMaterialReader`.
 * - Response 404: material not found or not owned by the user.
 *
 * **POST /api/materials/:id/opened**
 * Records that the material was opened in the Reader.
 * - Response 200: `{ lastOpenedAt }`
 * - Response 404: material not found or not owned by the user.
 *
 * **PATCH /api/materials/:id**
 * Updates mutable fields on a material (title, readerStart, categoryId).
 * - Body: partial material fields accepted by `updateMaterial`.
 * - Response 200: `{ material: Material }`
 * - Response 400: validation error.
 * - Response 404: material not found.
 *
 * **DELETE /api/materials/:id**
 * Permanently deletes a material and its associated data.
 * - Response 200: `{ deleted: true, id: number }`
 * - Response 404: material not found or not owned by the user.
 *
 * @param {Object} deps
 * @param {import("../../db/repositories.js").Repositories} deps.repositories
 * @returns {(req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse, url: URL, user: import("../../auth/session.js").SessionUser) => Promise<boolean>}
 */
export function createMaterialsRoutes({ repositories }) {
  return async function handleMaterialsRoutes(req, res, url, user) {
    if (req.method === "GET" && url.pathname === "/api/materials") {
      const languageId = Number(url.searchParams.get("languageId"));
      if (!(await repositories.languages.findById(languageId, user.userId))) {
        jsonResponse(res, 404, { error: "Language not found." });
        return true;
      }
      const categoryParam = url.searchParams.get("category") || "all";
      let category = null;
      if (categoryParam === "uncategorised") {
        category = "uncategorised";
      } else if (categoryParam !== "all") {
        if (!/^\d+$/.test(categoryParam)) {
          jsonResponse(res, 400, { error: "Invalid category filter.", errorKey: "errors.categoryInvalid" });
          return true;
        }
        category = Number(categoryParam);
        if (!(await repositories.categories.findById(category, user.userId))) {
          jsonResponse(res, 404, { error: "Category not found." });
          return true;
        }
      }
      jsonResponse(res, 200, {
        materials: await getMaterials(repositories, user.userId, languageId, url.searchParams.get("offset"), url.searchParams.get("search") || "", category),
        pageSize: 50
      });
      return true;
    }

    if (req.method === "POST" && url.pathname === "/api/materials") {
      // Resolve the per-user override BEFORE the parse cap; a raised limit would
      // otherwise be truncated at the wire before the service ever sees the file.
      const maxUploadBytes = await effectiveUploadBytesForUser(user.userId);
      let parsed;
      try {
        parsed = await readMultipart(req, maxUploadBytes + 1_000_000);
      } catch (error) {
        if (error.message === "Request body is too large.") {
          const maxMegabytes = Math.round(maxUploadBytes / 1024 / 1024);
          jsonResponse(res, 413, {
            error: `Documents can be no larger than ${maxMegabytes} MB during beta.`,
            errorKey: "errors.materialFileTooLarge",
            details: { maxMegabytes }
          });
          return true;
        }
        throw error;
      }
      const { fields, files } = parsed;
      const result = await startMaterialImport(repositories, user.userId, fields.languageId, files.file);
      if (result.error) {
        jsonResponse(res, result.status || 400, result);
        return true;
      }
      jsonResponse(res, 201, result);
      return true;
    }

    const openedMatch = url.pathname.match(/^\/api\/materials\/(\d+)\/opened$/);
    if (req.method === "POST" && openedMatch) {
      const opened = await markMaterialOpened(repositories, user.userId, Number(openedMatch[1]));
      if (!opened) {
        jsonResponse(res, 404, { error: "Material not found." });
        return true;
      }
      jsonResponse(res, 200, opened);
      return true;
    }

    const materialMatch = url.pathname.match(/^\/api\/materials\/(\d+)$/);
    if (!materialMatch) {
      return false;
    }

    if (req.method === "GET") {
      const reader = await getMaterialReader(repositories, user.userId, Number(materialMatch[1]), url.searchParams.has("start") ? url.searchParams.get("start") : null, url.searchParams.get("limit"));
      if (!reader) {
        jsonResponse(res, 404, { error: "Material not found." });
        return true;
      }
      jsonResponse(res, 200, reader);
      return true;
    }

    if (req.method === "PATCH") {
      const body = await readJson(req);
      const material = await updateMaterial(repositories, user.userId, Number(materialMatch[1]), body);
      if (!material) {
        jsonResponse(res, 404, { error: "Material not found." });
        return true;
      }
      if (material.error) {
        jsonResponse(res, 400, material);
        return true;
      }
      jsonResponse(res, 200, { material });
      return true;
    }

    if (req.method === "DELETE") {
      const materialId = Number(materialMatch[1]);
      if (!(await repositories.materials.findById(materialId, user.userId))) {
        jsonResponse(res, 404, { error: "Material not found." });
        return true;
      }
      const result = await repositories.materials.deleteById(materialId, user.userId);
      if (!result.changes) {
        jsonResponse(res, 404, { error: "Material not found." });
        return true;
      }
      jsonResponse(res, 200, { deleted: true, id: materialId });
      return true;
    }

    return false;
  };
}

/**
 * @fileoverview Route handlers for the `/api/materials` resource.
 *
 * Materials are documents (e.g. PDFs, text files) that a user uploads to a
 * study language. The reader endpoint streams paginated sentences/paragraphs
 * from a processed material so the frontend can display them word-by-word.
 */

import { getMaterialReader, getMaterials, startMaterialImport, updateMaterial } from "../../modules/materials/materials.service.js";
import { readJson, readMultipart } from "../request.js";
import { jsonResponse } from "../response.js";
import { BETA_MAX_MATERIAL_UPLOAD_BYTES } from "../../config.js";

/**
 * Creates the route handler for `/api/materials` and `/api/materials/:id`.
 *
 * **GET /api/materials?languageId=&[offset=]&[search=]**
 * Lists materials for a language, paginated (page size 50).
 * - Response 200: `{ materials: Material[], pageSize: 50 }`
 * - Response 404: language not found or not owned by the user.
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
 * **PATCH /api/materials/:id**
 * Updates mutable fields on a material (e.g. title).
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
      jsonResponse(res, 200, {
        materials: await getMaterials(repositories, user.userId, languageId, url.searchParams.get("offset"), url.searchParams.get("search") || ""),
        pageSize: 50
      });
      return true;
    }

    if (req.method === "POST" && url.pathname === "/api/materials") {
      let parsed;
      try {
        parsed = await readMultipart(req, BETA_MAX_MATERIAL_UPLOAD_BYTES + 1_000_000);
      } catch (error) {
        if (error.message === "Request body is too large.") {
          jsonResponse(res, 413, {
            error: "Documents can be no larger than 50 MB during beta.",
            errorKey: "errors.materialFileTooLarge",
            details: { maxMegabytes: Math.round(BETA_MAX_MATERIAL_UPLOAD_BYTES / 1024 / 1024) }
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

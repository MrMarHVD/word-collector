import { getMaterialReader, getMaterials, startMaterialImport, updateMaterialReaderStart } from "../../modules/materials/materials.service.js";
import { readJson, readMultipart } from "../request.js";
import { jsonResponse } from "../response.js";
import { BETA_MAX_MATERIAL_UPLOAD_BYTES } from "../../config.js";

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
      const material = await updateMaterialReaderStart(repositories, user.userId, Number(materialMatch[1]), body.readerStart);
      if (!material) {
        jsonResponse(res, 404, { error: "Material not found." });
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

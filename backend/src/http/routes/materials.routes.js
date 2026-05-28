import { getMaterialReader, getMaterials, importMaterial, updateMaterialReaderStart } from "../../modules/materials/materials.service.js";
import { readJson, readMultipart } from "../request.js";
import { jsonResponse } from "../response.js";

export function createMaterialsRoutes({ repositories }) {
  return async function handleMaterialsRoutes(req, res, url, user) {
    if (req.method === "GET" && url.pathname === "/api/materials") {
      const languageId = Number(url.searchParams.get("languageId"));
      if (!repositories.languages.findById(languageId, user.userId)) {
        jsonResponse(res, 404, { error: "Language not found." });
        return true;
      }
      jsonResponse(res, 200, {
        materials: getMaterials(repositories, user.userId, languageId, url.searchParams.get("offset"), url.searchParams.get("search") || ""),
        pageSize: 50
      });
      return true;
    }

    if (req.method === "POST" && url.pathname === "/api/materials") {
      const { fields, files } = await readMultipart(req);
      const result = await importMaterial(repositories, user.userId, fields.languageId, files.file);
      if (result.error) {
        jsonResponse(res, 400, result);
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
      const reader = getMaterialReader(repositories, user.userId, Number(materialMatch[1]), url.searchParams.has("start") ? url.searchParams.get("start") : null, url.searchParams.get("limit"));
      if (!reader) {
        jsonResponse(res, 404, { error: "Material not found." });
        return true;
      }
      jsonResponse(res, 200, reader);
      return true;
    }

    if (req.method === "PATCH") {
      const body = await readJson(req);
      const material = updateMaterialReaderStart(repositories, user.userId, Number(materialMatch[1]), body.readerStart);
      if (!material) {
        jsonResponse(res, 404, { error: "Material not found." });
        return true;
      }
      jsonResponse(res, 200, { material });
      return true;
    }

    if (req.method === "DELETE") {
      const materialId = Number(materialMatch[1]);
      if (!repositories.materials.findById(materialId, user.userId)) {
        jsonResponse(res, 404, { error: "Material not found." });
        return true;
      }
      const result = repositories.materials.deleteById(materialId, user.userId);
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

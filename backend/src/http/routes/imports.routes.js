import { importWords } from "../../modules/imports/imports.service.js";
import { readJson } from "../request.js";
import { jsonResponse } from "../response.js";

export function createImportsRoutes({ repositories }) {
  return async function handleImportsRoutes(req, res, url, user) {
    if (req.method !== "POST" || url.pathname !== "/api/import") {
      return false;
    }

    const body = await readJson(req);
    const result = importWords(repositories, user.userId, body.collectionName, body.languageId, body.words);
    if (result.error) {
      jsonResponse(res, 400, result);
      return true;
    }
    jsonResponse(res, 201, result);
    return true;
  };
}

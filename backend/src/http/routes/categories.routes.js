/**
 * @fileoverview Route handlers for the `/api/categories` resource.
 *
 * Categories are user-defined groups for works (materials), scoped to a study
 * language. All endpoints enforce ownership: another user's category or
 * language is reported as not found.
 */

import { createCategory, deleteCategory, listCategories, renameCategory, reorderCategories } from "../../modules/categories/categories.service.js";
import { readJson } from "../request.js";
import { jsonResponse } from "../response.js";

/**
 * Creates the route handler for `/api/categories`.
 *
 * **GET /api/categories?languageId=**
 * - Response 200: `{ categories: { id, name, position, materialCount }[], totalCount, uncategorisedCount }`
 * - Response 404: language not found or not owned by the user.
 *
 * **POST /api/categories** — body `{ languageId, name }`
 * - Response 201: `{ category }`
 * - Response 400: empty or too-long name (max 60 characters, trimmed).
 * - Response 404: language not found.
 * - Response 409: case-insensitive duplicate name (`errors.categoryNameTaken`).
 *
 * **PUT /api/categories/order** — body `{ languageId, ids }`
 * Persists the display order; `ids` must be exactly the user's categories for the language.
 * - Response 200: `{ categories }`
 * - Response 400: `ids` do not match the user's categories.
 * - Response 404: language not found.
 *
 * **PATCH /api/categories/:id** — body `{ name }`
 * - Response 200: `{ category }`
 * - Response 400 / 409: as for create.
 * - Response 404: category not found or not owned by the user.
 *
 * **DELETE /api/categories/:id**
 * Deletes the category; its works become uncategorised.
 * - Response 200: `{ ok: true }`
 * - Response 404: category not found or not owned by the user.
 *
 * @param {Object} deps
 * @param {import("../../db/repositories.js").Repositories} deps.repositories
 * @returns {(req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse, url: URL, user: import("../../auth/session.js").SessionUser) => Promise<boolean>}
 */
export function createCategoriesRoutes({ repositories }) {
  /**
   * Send an error descriptor from the categories service.
   * @param {import("node:http").ServerResponse} res
   * @param {{ status: number }} result
   */
  function sendError(res, result) {
    jsonResponse(res, result.status, result);
  }

  return async function handleCategoriesRoutes(req, res, url, user) {
    if (!url.pathname.startsWith("/api/categories")) {
      return false;
    }

    if (req.method === "GET" && url.pathname === "/api/categories") {
      const languageId = Number(url.searchParams.get("languageId"));
      if (!(await repositories.languages.findById(languageId, user.userId))) {
        jsonResponse(res, 404, { error: "Language not found." });
        return true;
      }
      jsonResponse(res, 200, await listCategories(repositories, user.userId, languageId));
      return true;
    }

    if (req.method === "POST" && url.pathname === "/api/categories") {
      const body = await readJson(req);
      const languageId = Number(body.languageId);
      if (!(await repositories.languages.findById(languageId, user.userId))) {
        jsonResponse(res, 404, { error: "Language not found." });
        return true;
      }
      const result = await createCategory(repositories, user.userId, languageId, body.name);
      if (result.error) {
        sendError(res, result);
        return true;
      }
      jsonResponse(res, 201, result);
      return true;
    }

    if (req.method === "PUT" && url.pathname === "/api/categories/order") {
      const body = await readJson(req);
      const languageId = Number(body.languageId);
      if (!(await repositories.languages.findById(languageId, user.userId))) {
        jsonResponse(res, 404, { error: "Language not found." });
        return true;
      }
      const result = await reorderCategories(repositories, user.userId, languageId, body.ids);
      if (result.error) {
        sendError(res, result);
        return true;
      }
      jsonResponse(res, 200, result);
      return true;
    }

    const categoryMatch = url.pathname.match(/^\/api\/categories\/(\d+)$/);
    if (!categoryMatch) {
      return false;
    }
    const categoryId = Number(categoryMatch[1]);

    if (req.method === "PATCH") {
      const body = await readJson(req);
      const result = await renameCategory(repositories, user.userId, categoryId, body.name);
      if (!result) {
        jsonResponse(res, 404, { error: "Category not found." });
        return true;
      }
      if (result.error) {
        sendError(res, result);
        return true;
      }
      jsonResponse(res, 200, result);
      return true;
    }

    if (req.method === "DELETE") {
      if (!(await deleteCategory(repositories, user.userId, categoryId))) {
        jsonResponse(res, 404, { error: "Category not found." });
        return true;
      }
      jsonResponse(res, 200, { ok: true });
      return true;
    }

    return false;
  };
}

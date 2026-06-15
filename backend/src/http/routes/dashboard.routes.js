/**
 * @fileoverview Route handlers for the dashboard resource (`/api/dashboard`).
 *
 * The dashboard aggregates vocabulary progress stats and a paginated list of
 * recently-read documents for the user's active study language. Both endpoints
 * accept an optional `languageId` query parameter; when omitted the service
 * selects the user's default or most-recently-used language.
 */

import { getDashboard, getDashboardDocuments } from "../../modules/dashboard/dashboard.service.js";
import { jsonResponse } from "../response.js";

/**
 * Creates route handlers for `/api/dashboard` and `/api/dashboard/documents`.
 *
 * **GET /api/dashboard?[languageId=]**
 * Returns aggregated vocabulary statistics for the user's study language.
 * - Response 200: dashboard payload from `getDashboard` (word counts by status,
 *   recent activity, etc.).
 *
 * **GET /api/dashboard/documents?[languageId=]&[search=]&[limit=]&[offset=]**
 * Returns a paginated, searchable list of documents the user has read in a
 * language. Supports the same `languageId` fallback as the main dashboard.
 * - Response 200: documents payload from `getDashboardDocuments`.
 *
 * @param {Object} deps
 * @param {import("../../db/repositories.js").Repositories} deps.repositories
 * @returns {(req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse, url: URL, user: import("../../auth/session.js").SessionUser) => Promise<boolean>}
 */
export function createDashboardRoutes({ repositories }) {
  return async function handleDashboardRoutes(req, res, url, user) {
    if (req.method === "GET" && url.pathname === "/api/dashboard") {
      jsonResponse(res, 200, await getDashboard(repositories, user.userId, url.searchParams.get("languageId")));
      return true;
    }

    if (req.method === "GET" && url.pathname === "/api/dashboard/documents") {
      jsonResponse(res, 200, await getDashboardDocuments(repositories, user.userId, {
        languageId: url.searchParams.get("languageId"),
        search: url.searchParams.get("search") || "",
        limit: url.searchParams.get("limit"),
        offset: url.searchParams.get("offset")
      }));
      return true;
    }

    return false;
  };
}

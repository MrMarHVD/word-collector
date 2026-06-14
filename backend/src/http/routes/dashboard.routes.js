import { getDashboard, getDashboardDocuments } from "../../modules/dashboard/dashboard.service.js";
import { jsonResponse } from "../response.js";

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

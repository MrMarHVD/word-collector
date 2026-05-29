import { getDashboard } from "../../modules/dashboard/dashboard.service.js";
import { jsonResponse } from "../response.js";

export function createDashboardRoutes({ repositories }) {
  return async function handleDashboardRoutes(req, res, url, user) {
    if (req.method !== "GET" || url.pathname !== "/api/dashboard") {
      return false;
    }

    jsonResponse(res, 200, await getDashboard(repositories, user.userId, url.searchParams.get("languageId")));
    return true;
  };
}

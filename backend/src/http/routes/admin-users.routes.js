/**
 * @fileoverview Admin "Users" route factory.
 *
 * Serves the Users panel of the Admin tab: a keyset-paginated, searchable,
 * filterable user list, and the per-user material-limit override mutation. Every
 * handler asserts the admin privilege via `requireAdmin` before responding; the
 * admin-vs-admin edit guard is enforced in the service layer.
 *
 * This file owns the `/api/admin/users/*` surface and does not touch `api.js` or
 * the sibling admin route files.
 */

import { listUsers, setUserLimits } from "../../modules/admin/admin-users.service.js";
import { readJson } from "../request.js";
import { jsonResponse } from "../response.js";
import { requireAdmin } from "./admin-guards.js";

/**
 * Create the `/api/admin/users/*` route handler.
 *
 * **GET /api/admin/users**
 * Returns one keyset page of users for the Users panel.
 * - Query: `sort` (`email`|`created_at`), `search`, `createdAfter` (ISO date),
 *   `cursorValue` + `cursorId` (opaque keyset cursor from the previous page).
 * - Response 200: `{ users: User[], nextCursor: { value, id }|null }`.
 * - Response 403: caller is not an admin.
 *
 * **POST /api/admin/users/:id/limits**
 * Sets or clears the target user's two material-limit overrides.
 * - Body: `{ maxMaterials: number|null, maxUploadBytes: number|null }`
 *   (`null`/empty clears that override, reverting to the global default).
 * - Response 200: `{ user: User }`.
 * - Response 400: invalid limit value.
 * - Response 403: a non-superadmin editing an admin row or themselves.
 * - Response 404: target user not found.
 *
 * @param {Object} deps
 * @param {import("../../db/repositories.js").Repositories} deps.repositories
 * @returns {(req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse, url: URL, user: import("../../auth/session.js").SessionUser) => Promise<boolean>}
 *   Resolves to `true` if the request was handled, otherwise `false`.
 */
export function createAdminUsersRoutes({ repositories }) {
  return async function handleAdminUsersRoutes(req, res, url, user) {
    if (req.method === "GET" && url.pathname === "/api/admin/users") {
      if (!requireAdmin(res, user)) {
        return true;
      }
      const params = url.searchParams;
      const result = await listUsers({
        sort: params.get("sort") || "email",
        search: params.get("search") || "",
        createdAfter: params.get("createdAfter") || null,
        cursorValue: params.get("cursorValue"),
        cursorId: params.get("cursorId")
      });
      jsonResponse(res, 200, result);
      return true;
    }

    const limitsMatch = url.pathname.match(/^\/api\/admin\/users\/(\d+)\/limits$/);
    if (req.method === "POST" && limitsMatch) {
      if (!requireAdmin(res, user)) {
        return true;
      }
      const body = await readJson(req);
      const result = await setUserLimits(repositories, user, Number(limitsMatch[1]), {
        maxMaterials: body?.maxMaterials,
        maxUploadBytes: body?.maxUploadBytes
      });
      if (result.error) {
        jsonResponse(res, result.status || 400, result);
        return true;
      }
      jsonResponse(res, 200, result);
      return true;
    }

    return false;
  };
}

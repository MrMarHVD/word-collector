/**
 * @fileoverview Admin "Superadmin" route factory (ADM-004).
 *
 * Implements the superadmin-only endpoints reachable under
 * `/api/admin/superadmin/*`. Every handler asserts the superadmin tier via
 * `requireSuperadmin` (returning 403 to admins and regular users) before doing
 * any work, mirroring the dispatcher's middleware-like convention.
 *
 * Endpoints:
 *  - `POST   /api/admin/superadmin/grant`   `{ email }`  → grant the admin flag.
 *  - `POST   /api/admin/superadmin/revoke`  `{ email }`  → revoke the admin flag.
 *  - `GET    /api/admin/superadmin/audit?page=N`         → paginated audit log.
 *
 * The superadmin flag itself is never settable through these endpoints — it is
 * provisioned only via the seed script — and the service refuses any operation
 * targeting a superadmin, so the highest tier cannot be self-demoted.
 *
 * This factory constructs its own superadmin repository from the shared `db`
 * executor (as the provisioning script does) so it can own its SQL without
 * editing the central module registry, while reusing the wired `repositories`
 * map only for the shared `recordAudit` helper.
 */

import { db } from "../../db/index.js";
import { createAdminSuperadminRepository } from "../../modules/admin/admin-superadmin.repository.js";
import { grantAdmin, readAuditLog, revokeAdmin } from "../../modules/admin/admin-superadmin.service.js";
import { readJson } from "../request.js";
import { jsonResponse } from "../response.js";
import { requireSuperadmin } from "./admin-guards.js";

/**
 * Create the `/api/admin/superadmin/*` route handler.
 *
 * @param {Object} deps
 * @param {import("../../db/repositories.js").Repositories} deps.repositories
 * @returns {(req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse, url: URL, user: import("../../auth/session.js").SessionUser) => Promise<boolean>}
 *   Resolves to `true` if the request was handled, otherwise `false`.
 */
export function createAdminSuperadminRoutes({ repositories }) {
  const superadminRepository = createAdminSuperadminRepository(db);

  return async function handleAdminSuperadminRoutes(req, res, url, user) {
    if (!url.pathname.startsWith("/api/admin/superadmin/")) {
      return false;
    }

    if (req.method === "POST" && url.pathname === "/api/admin/superadmin/grant") {
      if (!requireSuperadmin(res, user)) {
        return true;
      }
      const body = await readJson(req);
      const result = await grantAdmin(repositories, superadminRepository, { userId: user.userId }, body.email);
      if (result.error) {
        jsonResponse(res, result.status, { error: result.error, errorKey: result.errorKey });
        return true;
      }
      jsonResponse(res, 200, { user: result.user });
      return true;
    }

    if (req.method === "POST" && url.pathname === "/api/admin/superadmin/revoke") {
      if (!requireSuperadmin(res, user)) {
        return true;
      }
      const body = await readJson(req);
      const result = await revokeAdmin(repositories, superadminRepository, { userId: user.userId }, body.email);
      if (result.error) {
        jsonResponse(res, result.status, { error: result.error, errorKey: result.errorKey });
        return true;
      }
      jsonResponse(res, 200, { user: result.user });
      return true;
    }

    if (req.method === "GET" && url.pathname === "/api/admin/superadmin/audit") {
      if (!requireSuperadmin(res, user)) {
        return true;
      }
      const page = Number(url.searchParams.get("page")) || 1;
      jsonResponse(res, 200, await readAuditLog(superadminRepository, page));
      return true;
    }

    return false;
  };
}

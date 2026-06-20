/**
 * @fileoverview Privilege guards for admin route handlers.
 *
 * The API dispatcher already proves a valid session before authenticated route
 * factories run, so these guards only assert the additional privilege tier. Each
 * guard writes a `403` response and returns `false` when the user lacks the
 * required privilege, letting the caller short-circuit; it returns `true` when the
 * user is authorised. This mirrors the middleware-like convention used elsewhere.
 */

import { jsonResponse } from "../response.js";

/**
 * Assert that the authenticated user holds the admin (or superadmin) privilege.
 * Writes a `403` response and returns `false` when the user is not an admin.
 *
 * @param {import("node:http").ServerResponse} res - Response to write a 403 to on failure.
 * @param {{ isAdmin?: boolean, isSuperadmin?: boolean }} user - The per-request user.
 * @returns {boolean} `true` when the user may access admin functionality.
 */
export function requireAdmin(res, user) {
  if (user?.isAdmin === true || user?.isSuperadmin === true) {
    return true;
  }
  jsonResponse(res, 403, { error: "Admin privileges required.", errorKey: "errors.adminRequired" });
  return false;
}

/**
 * Assert that the authenticated user holds the superadmin privilege.
 * Writes a `403` response and returns `false` when the user is not a superadmin.
 *
 * @param {import("node:http").ServerResponse} res - Response to write a 403 to on failure.
 * @param {{ isSuperadmin?: boolean }} user - The per-request user.
 * @returns {boolean} `true` when the user may access superadmin functionality.
 */
export function requireSuperadmin(res, user) {
  if (user?.isSuperadmin === true) {
    return true;
  }
  jsonResponse(res, 403, { error: "Superadmin privileges required.", errorKey: "errors.superadminRequired" });
  return false;
}

/**
 * @fileoverview Superadmin service (ADM-004). Business logic for the
 * superadmin-only grant/revoke of the admin flag and for reading the admin
 * audit log.
 *
 * Every grant/revoke is recorded through the shared `recordAudit` helper (ADM-001)
 * so the action is observable in the audit-log view. The `is_superadmin` flag is
 * never mutated here; the service additionally refuses any operation that would
 * touch a superadmin's own privileges, so the highest tier stays immutable
 * through the API.
 */

import { recordAudit } from "./admin.service.js";

/** Maximum audit-log rows returned per page. */
export const AUDIT_PAGE_SIZE = 20;

/**
 * Resolve a request body's target into a user row, returning a structured error
 * when the email is missing or unknown.
 *
 * @param {object} superadminRepository
 * @param {string} email - Target user's email.
 * @returns {Promise<{user: object}|{error: string, errorKey: string, status: number}>}
 */
async function resolveTarget(superadminRepository, email) {
  const normalized = String(email || "").trim();
  if (!normalized) {
    return { error: "A target email is required.", errorKey: "errors.adminTargetRequired", status: 400 };
  }
  const user = await superadminRepository.findUserByEmail(normalized);
  if (!user) {
    return { error: "No user matches that email.", errorKey: "errors.adminTargetNotFound", status: 404 };
  }
  return { user };
}

/**
 * Grant the admin flag to the user identified by `email`. Idempotent for users
 * who are already admins. Records an `admin.grant` audit entry on a real change.
 *
 * @param {object} repositories - Wired repository map (for `recordAudit`).
 * @param {object} superadminRepository - Superadmin repository (own queries).
 * @param {{ userId: number }} actor - The acting superadmin.
 * @param {string} email - Target user's email.
 * @returns {Promise<{user: {id: number, email: string, isAdmin: boolean}}|{error: string, errorKey: string, status: number}>}
 */
export async function grantAdmin(repositories, superadminRepository, actor, email) {
  const resolved = await resolveTarget(superadminRepository, email);
  if (resolved.error) {
    return resolved;
  }
  const target = resolved.user;
  if (target.isSuperadmin === true) {
    return { error: "A superadmin's privileges cannot be changed.", errorKey: "errors.adminSuperadminImmutable", status: 403 };
  }
  if (target.isAdmin !== true) {
    await superadminRepository.setAdminFlag(true, target.id);
    await recordAudit(
      repositories,
      actor,
      "admin.grant",
      `user:${target.id}`,
      { isAdmin: false },
      { isAdmin: true }
    );
  }
  return { user: { id: target.id, email: target.email, isAdmin: true } };
}

/**
 * Revoke the admin flag from the user identified by `email`. Idempotent for
 * users who are not admins. Records an `admin.revoke` audit entry on a real
 * change. Revocation takes effect on the target's next request because the
 * session-user query re-reads `is_admin` per request (ADM-001).
 *
 * @param {object} repositories - Wired repository map (for `recordAudit`).
 * @param {object} superadminRepository - Superadmin repository (own queries).
 * @param {{ userId: number }} actor - The acting superadmin.
 * @param {string} email - Target user's email.
 * @returns {Promise<{user: {id: number, email: string, isAdmin: boolean}}|{error: string, errorKey: string, status: number}>}
 */
export async function revokeAdmin(repositories, superadminRepository, actor, email) {
  const resolved = await resolveTarget(superadminRepository, email);
  if (resolved.error) {
    return resolved;
  }
  const target = resolved.user;
  if (target.isSuperadmin === true) {
    return { error: "A superadmin's privileges cannot be changed.", errorKey: "errors.adminSuperadminImmutable", status: 403 };
  }
  if (target.isAdmin === true) {
    await superadminRepository.setAdminFlag(false, target.id);
    await recordAudit(
      repositories,
      actor,
      "admin.revoke",
      `user:${target.id}`,
      { isAdmin: true },
      { isAdmin: false }
    );
  }
  return { user: { id: target.id, email: target.email, isAdmin: false } };
}

/**
 * Read one page of the admin audit log, newest first, with pagination metadata.
 *
 * @param {object} superadminRepository - Superadmin repository (own queries).
 * @param {number} [page=1] - 1-based page number; values below 1 clamp to 1.
 * @returns {Promise<{entries: Array<object>, page: number, pageSize: number, total: number, totalPages: number}>}
 */
export async function readAuditLog(superadminRepository, page = 1) {
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const total = await superadminRepository.countAuditEntries();
  const totalPages = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));
  const clampedPage = Math.min(safePage, totalPages);
  const offset = (clampedPage - 1) * AUDIT_PAGE_SIZE;
  const entries = await superadminRepository.listAuditEntries(AUDIT_PAGE_SIZE, offset);
  return { entries, page: clampedPage, pageSize: AUDIT_PAGE_SIZE, total, totalPages };
}

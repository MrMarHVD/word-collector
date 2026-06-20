/**
 * @fileoverview Admin users service. Business logic for the Users panel: listing
 * users with keyset pagination and effective material limits, and setting or
 * clearing the per-user material-limit overrides with full authorisation and
 * audit. Effective limit = override ?? global default.
 *
 * The new per-user queries live in a dedicated admin-users repository built here
 * from the shared `db` executor (the global module registry is owned by the
 * admin foundation issue and is not extended from here).
 */

import { db } from "../../db/index.js";
import { BETA_MAX_MATERIALS_PER_USER, BETA_MAX_MATERIAL_UPLOAD_BYTES } from "../../config.js";
import { createAdminUsersRepository } from "./admin-users.repository.js";
import { recordAudit } from "./admin.service.js";

const adminUsers = createAdminUsersRepository(db);

// Page size for the infinite-scrolling Users panel. One extra row is fetched to
// detect whether a further page exists without a second count query.
const USERS_PAGE_SIZE = 50;

/**
 * Resolve a user's effective material limits, applying the override when set and
 * falling back to the global beta defaults otherwise.
 *
 * @param {{ maxMaterialsOverride: number|null, maxUploadBytesOverride: number|string|null }} user
 * @returns {{ maxMaterials: number, maxUploadBytes: number }} Effective limits.
 */
export function effectiveLimitsForUser(user) {
  const overrideMaterials = user?.maxMaterialsOverride;
  const overrideBytes = user?.maxUploadBytesOverride;
  return {
    maxMaterials: overrideMaterials ?? BETA_MAX_MATERIALS_PER_USER,
    maxUploadBytes: overrideBytes != null ? Number(overrideBytes) : BETA_MAX_MATERIAL_UPLOAD_BYTES
  };
}

/**
 * Resolve the effective single-upload byte limit for a user id. Used by the
 * upload path so a raised override is honoured both at the parse-time stream cap
 * and in the service-level size check.
 *
 * @param {number} userId
 * @returns {Promise<number>} Effective max upload size in bytes.
 */
export async function effectiveUploadBytesForUser(userId) {
  const user = await adminUsers.findUserForLimits(Number(userId));
  const override = user?.maxUploadBytesOverride;
  return override != null ? Number(override) : BETA_MAX_MATERIAL_UPLOAD_BYTES;
}

/**
 * Resolve the effective material-count limit for a user id.
 *
 * @param {number} userId
 * @returns {Promise<number>} Effective max number of documents.
 */
export async function effectiveMaterialCountForUser(userId) {
  const user = await adminUsers.findUserForLimits(Number(userId));
  const override = user?.maxMaterialsOverride;
  return override != null ? Number(override) : BETA_MAX_MATERIALS_PER_USER;
}

/**
 * Return one keyset page of users for the Users panel, each row carrying its
 * effective limits and material count, plus the cursor for the next page.
 *
 * @param {object} options
 * @param {"email"|"created_at"} [options.sort="email"] - Sort order.
 * @param {string} [options.search=""] - Email substring filter.
 * @param {string|null} [options.createdAfter=null] - ISO lower bound on account
 *   creation date.
 * @param {string|null} [options.cursorValue=null] - Sort-key value of the last
 *   row from the previous page.
 * @param {number|null} [options.cursorId=null] - Id of the last row from the
 *   previous page.
 * @returns {Promise<{ users: object[], nextCursor: { value: string, id: number }|null }>}
 */
export async function listUsers({ sort = "email", search = "", createdAfter = null, cursorValue = null, cursorId = null } = {}) {
  const normalizedSort = sort === "created_at" ? "created_at" : "email";
  const trimmedSearch = String(search || "").trim();
  const cursor = cursorValue != null && cursorId != null ? { value: cursorValue, id: Number(cursorId) } : null;
  const rows = await adminUsers.listUsers({
    sort: normalizedSort,
    search: trimmedSearch || null,
    createdAfter: createdAfter || null,
    cursor,
    limit: USERS_PAGE_SIZE + 1
  });

  const hasMore = rows.length > USERS_PAGE_SIZE;
  const page = hasMore ? rows.slice(0, USERS_PAGE_SIZE) : rows;
  const users = page.map((row) => {
    const limits = effectiveLimitsForUser(row);
    return {
      id: row.id,
      email: row.email,
      createdAt: row.createdAt,
      isAdmin: row.isAdmin === true,
      isSuperadmin: row.isSuperadmin === true,
      materialCount: row.materialCount,
      maxMaterials: limits.maxMaterials,
      maxUploadBytes: limits.maxUploadBytes,
      maxMaterialsOverride: row.maxMaterialsOverride ?? null,
      maxUploadBytesOverride: row.maxUploadBytesOverride != null ? Number(row.maxUploadBytesOverride) : null
    };
  });

  const last = page[page.length - 1];
  const nextCursor = hasMore && last
    ? { value: normalizedSort === "created_at" ? last.createdAt : last.email, id: last.id }
    : null;
  return { users, nextCursor };
}

// Coerce an incoming override value to a non-negative integer, or null to clear
// it. Returns `undefined` when the value is present but invalid.
function normalizeOverride(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || !Number.isInteger(number)) {
    return undefined;
  }
  return number;
}

/**
 * Set or clear a user's two material-limit overrides. Enforces the admin-vs-admin
 * guard server-side: a non-superadmin caller may not edit an admin row or their
 * own account. Audits the before/after override snapshot on success.
 *
 * @param {object} repositories - Wired repository map (must include `admin`).
 * @param {{ userId: number, isSuperadmin: boolean }} actor - Authenticated caller.
 * @param {number} targetUserId - User whose overrides are being changed.
 * @param {{ maxMaterials?: number|null, maxUploadBytes?: number|null }} updates -
 *   New override values; `null`/empty clears that override.
 * @returns {Promise<{ user: object }|{ error: string, errorKey: string, status: number }>}
 */
export async function setUserLimits(repositories, actor, targetUserId, updates = {}) {
  const target = await adminUsers.findUserForLimits(Number(targetUserId));
  if (!target) {
    return { status: 404, error: "User not found.", errorKey: "errors.adminUserNotFound" };
  }

  const editingPrivileged = target.isAdmin === true || target.isSuperadmin === true;
  const editingSelf = target.id === actor.userId;
  if (!actor.isSuperadmin && (editingPrivileged || editingSelf)) {
    return { status: 403, error: "You cannot edit this user.", errorKey: "errors.adminCannotEditAdmin" };
  }

  const maxMaterials = normalizeOverride(updates.maxMaterials);
  const maxUploadBytes = normalizeOverride(updates.maxUploadBytes);
  if (maxMaterials === undefined || maxUploadBytes === undefined) {
    return { status: 400, error: "Limits must be whole, non-negative numbers.", errorKey: "errors.adminInvalidLimit" };
  }

  const before = {
    maxMaterials: target.maxMaterialsOverride ?? null,
    maxUploadBytes: target.maxUploadBytesOverride != null ? Number(target.maxUploadBytesOverride) : null
  };
  await adminUsers.setUserLimits(target.id, maxMaterials, maxUploadBytes);
  const after = { maxMaterials, maxUploadBytes };
  await recordAudit(repositories, actor, "user.setLimit", `user:${target.id}`, before, after);

  const updated = await adminUsers.findUserForLimits(target.id);
  const limits = effectiveLimitsForUser(updated);
  return {
    user: {
      id: updated.id,
      email: updated.email,
      isAdmin: updated.isAdmin === true,
      isSuperadmin: updated.isSuperadmin === true,
      maxMaterials: limits.maxMaterials,
      maxUploadBytes: limits.maxUploadBytes,
      maxMaterialsOverride: updated.maxMaterialsOverride ?? null,
      maxUploadBytesOverride: updated.maxUploadBytesOverride != null ? Number(updated.maxUploadBytesOverride) : null
    }
  };
}

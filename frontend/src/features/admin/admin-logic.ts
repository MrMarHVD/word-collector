/**
 * Pure rules of the admin feature, ported from the legacy admin controllers
 * (js/features/admin/*): row edit gating, limit conversions, list query
 * parameters and audit-log labels. The server enforces every privilege; these
 * only mirror it in the UI.
 */

import type { AdminUser, AdminUsersParams, SetUserLimitsRequest, User } from "@/lib/api/types";

export type AdminSubtab = "admin" | "superadmin";
export type AdminRail = "users" | "words";
export type AdminUsersSort = NonNullable<AdminUsersParams["sort"]>;

const BYTES_PER_MB = 1024 * 1024;

/** Remaining scroll distance (px) below which the users list loads its next page. */
export const USERS_SCROLL_THRESHOLD = 120;

/** The subtab to show: non-superadmins are always on "admin". */
export function resolveAdminSubtab(subtab: AdminSubtab, isSuperadmin: boolean): AdminSubtab {
  return subtab === "superadmin" && isSuperadmin ? "superadmin" : "admin";
}

/**
 * Whether the viewer may edit a row's limits: the superadmin may edit anyone;
 * a regular admin may not edit an admin row or their own account.
 */
export function canEditUser(viewer: Pick<User, "id" | "isSuperadmin"> | null, row: Pick<AdminUser, "id" | "isAdmin" | "isSuperadmin">): boolean {
  if (viewer?.isSuperadmin === true) {
    return true;
  }
  return !row.isAdmin && !row.isSuperadmin && viewer?.id !== row.id;
}

/** An upload-byte limit as a whole number of megabytes. */
export function bytesToMb(bytes: number): number {
  return Math.round(Number(bytes) / BYTES_PER_MB);
}

/** The limit form's input values for a row: an empty string means no override. */
export function limitInputValues(row: Pick<AdminUser, "maxMaterialsOverride" | "maxUploadBytesOverride">): { materials: string; uploadMb: string } {
  return {
    materials: row.maxMaterialsOverride == null ? "" : String(row.maxMaterialsOverride),
    uploadMb: row.maxUploadBytesOverride == null ? "" : String(bytesToMb(row.maxUploadBytesOverride))
  };
}

/** The limits request for the form's raw values: an empty field clears that override; megabytes become bytes. */
export function limitsRequest(materials: string, uploadMb: string): SetUserLimitsRequest {
  const materialsValue = materials.trim();
  const uploadValue = uploadMb.trim();
  return {
    maxMaterials: materialsValue === "" ? null : Number(materialsValue),
    maxUploadBytes: uploadValue === "" ? null : Math.round(Number(uploadValue) * BYTES_PER_MB)
  };
}

/** The users-list filters for the API: a trimmed search and the join-date filter as an ISO timestamp. */
export function usersQueryParams(sort: AdminUsersSort, search: string, createdAfter: string): Omit<AdminUsersParams, "cursorValue" | "cursorId"> {
  const params: Omit<AdminUsersParams, "cursorValue" | "cursorId"> = { sort };
  if (search.trim()) {
    params.search = search.trim();
  }
  if (createdAfter) {
    params.createdAfter = new Date(createdAfter).toISOString();
  }
  return params;
}

/** Whether a scrolled list is close enough to its end to load the next page. */
export function isNearListEnd(list: Pick<HTMLElement, "scrollHeight" | "scrollTop" | "clientHeight">, threshold = USERS_SCROLL_THRESHOLD): boolean {
  return list.scrollHeight - list.scrollTop - list.clientHeight < threshold;
}

/** The words panel's default translation language: English when offered, else the first option. */
export function defaultNativeLanguage(options: string[]): string {
  if (!options.length) {
    return "English";
  }
  return options.includes("English") ? "English" : options[0];
}

const AUDIT_ACTION_KEYS: Record<string, string> = {
  "admin.grant": "admin.superadminActionGrant",
  "admin.revoke": "admin.superadminActionRevoke"
};

/** The locale key for a stored audit action, or null for an unknown action (shown raw). */
export function auditActionKey(action: string): string | null {
  return AUDIT_ACTION_KEYS[action] ?? null;
}

/** The locale key for an audit before/after admin snapshot. */
export function auditSnapshotKey(value: unknown): string {
  if (!value || typeof value !== "object" || (value as { isAdmin?: unknown }).isAdmin === undefined) {
    return "admin.superadminSnapshotNone";
  }
  return (value as { isAdmin?: unknown }).isAdmin ? "admin.superadminSnapshotAdmin" : "admin.superadminSnapshotRegular";
}

/** An audit timestamp in the UI locale (medium date, short time), or "" when missing or invalid. */
export function formatAuditTimestamp(value: string | null | undefined, locale: string): string {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

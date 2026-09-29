/** /api/admin/* endpoints (users, words, superadmin). All return 403 below the required tier. */

import { request } from "./client";
import type {
  AdminUsersParams,
  AdminUsersResponse,
  AdminWordLanguagesResponse,
  AdminWordsParams,
  AdminWordsResponse,
  AuditLogResponse,
  AdminWord,
  SetCanonicalTranslationRequest,
  SetUserLimitsRequest,
  SetUserLimitsResponse,
  SuperadminTargetResponse
} from "./types";

/** GET /api/admin/users: one keyset page of users. */
export function listUsers(params: AdminUsersParams = {}): Promise<AdminUsersResponse> {
  return request("/api/admin/users", {
    query: { sort: params.sort, search: params.search, createdAfter: params.createdAfter, cursorValue: params.cursorValue, cursorId: params.cursorId }
  });
}

/** POST /api/admin/users/:id/limits: sets or clears a user's material-limit overrides. */
export function setUserLimits(userId: number, body: SetUserLimitsRequest): Promise<SetUserLimitsResponse> {
  return request(`/api/admin/users/${userId}/limits`, { method: "POST", body });
}

/** GET /api/admin/words/languages: source languages with words, plus native-language options. */
export function wordLanguages(): Promise<AdminWordLanguagesResponse> {
  return request("/api/admin/words/languages");
}

/** GET /api/admin/words: one keyset page of a source language's words with the canonical translation. */
export function listWords(params: AdminWordsParams): Promise<AdminWordsResponse> {
  return request("/api/admin/words", {
    query: { languageId: params.languageId, native: params.native, search: params.search, cursor: params.cursor, limit: params.limit }
  });
}

/** PATCH /api/admin/words/:id/translation: upserts the shared canonical translation. */
export function setCanonicalTranslation(wordId: number, body: SetCanonicalTranslationRequest): Promise<{ word: AdminWord }> {
  return request(`/api/admin/words/${wordId}/translation`, { method: "PATCH", body });
}

/** POST /api/admin/superadmin/grant (superadmin only). */
export function grantAdmin(email: string): Promise<SuperadminTargetResponse> {
  return request("/api/admin/superadmin/grant", { method: "POST", body: { email } });
}

/** POST /api/admin/superadmin/revoke (superadmin only). */
export function revokeAdmin(email: string): Promise<SuperadminTargetResponse> {
  return request("/api/admin/superadmin/revoke", { method: "POST", body: { email } });
}

/** GET /api/admin/superadmin/audit?page= (superadmin only; 20 entries per page). */
export function auditLog(page = 1): Promise<AuditLogResponse> {
  return request("/api/admin/superadmin/audit", { query: { page } });
}

/** /api/dashboard endpoints. */

import { request } from "./client";
import type { DashboardDocumentsParams, DashboardDocumentsResponse, DashboardResponse } from "./types";

/** GET /api/dashboard?languageId=: vocabulary totals and collection stats for a study language. */
export function get(params: { languageId?: number | null } = {}): Promise<DashboardResponse> {
  return request("/api/dashboard", { query: { languageId: params.languageId } });
}

/** GET /api/dashboard/documents: paginated, searchable per-document reading stats. */
export function documents(params: DashboardDocumentsParams = {}): Promise<DashboardDocumentsResponse> {
  return request("/api/dashboard/documents", {
    query: { languageId: params.languageId, search: params.search, limit: params.limit, offset: params.offset }
  });
}

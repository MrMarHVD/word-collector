/** /api/materials endpoints (uploaded documents and the reader). */

import { request } from "./client";
import type {
  DeletedResponse,
  MaterialOpenedResponse,
  MaterialReaderParams,
  MaterialReaderResponse,
  MaterialResponse,
  MaterialsParams,
  MaterialsResponse,
  UpdateMaterialRequest,
  UploadMaterialRequest,
  UploadMaterialResponse
} from "./types";

/**
 * GET /api/materials: one page (50) of a language's materials, most recently
 * opened first; `search` is trimmed and `category` (default all) filters.
 */
export function list(params: MaterialsParams): Promise<MaterialsResponse> {
  return request("/api/materials", {
    query: {
      languageId: params.languageId,
      offset: params.offset ?? 0,
      search: params.search?.trim(),
      category: params.category === undefined ? undefined : String(params.category)
    }
  });
}

/** POST /api/materials (multipart): starts a background import (201). 413/409/503 carry localised beta-limit errors. */
export function upload({ languageId, file }: UploadMaterialRequest): Promise<UploadMaterialResponse> {
  const form = new FormData();
  form.append("languageId", String(languageId));
  form.append("file", file);
  return request("/api/materials", { method: "POST", body: form });
}

/** GET /api/materials/:id: material metadata plus one page of annotated reader tokens. */
export function reader(materialId: number, params: MaterialReaderParams = {}): Promise<MaterialReaderResponse> {
  return request(`/api/materials/${materialId}`, {
    query: { limit: params.limit, start: params.start === undefined ? undefined : Math.max(params.start, 0) }
  });
}

/** PATCH /api/materials/:id: rename, save the reading position and/or set the category (null = uncategorised). */
export function update(materialId: number, body: UpdateMaterialRequest): Promise<MaterialResponse> {
  return request(`/api/materials/${materialId}`, { method: "PATCH", body });
}

/** DELETE /api/materials/:id. */
export function remove(materialId: number): Promise<DeletedResponse> {
  return request(`/api/materials/${materialId}`, { method: "DELETE" });
}

/** POST /api/materials/:id/opened: records that the work was opened in the Reader. */
export function markOpened(materialId: number): Promise<MaterialOpenedResponse> {
  return request(`/api/materials/${materialId}/opened`, { method: "POST" });
}

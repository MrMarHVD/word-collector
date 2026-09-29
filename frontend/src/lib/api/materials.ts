/** /api/materials endpoints (uploaded documents and the reader). */

import { request } from "./client";
import type {
  DeletedResponse,
  MaterialReaderParams,
  MaterialReaderResponse,
  MaterialResponse,
  MaterialsParams,
  MaterialsResponse,
  UpdateMaterialRequest,
  UploadMaterialRequest,
  UploadMaterialResponse
} from "./types";

/** GET /api/materials: one page (50) of a language's materials; `search` is trimmed. */
export function list(params: MaterialsParams): Promise<MaterialsResponse> {
  return request("/api/materials", { query: { languageId: params.languageId, offset: params.offset ?? 0, search: params.search?.trim() } });
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

/** PATCH /api/materials/:id: rename and/or save the reading position. */
export function update(materialId: number, body: UpdateMaterialRequest): Promise<MaterialResponse> {
  return request(`/api/materials/${materialId}`, { method: "PATCH", body });
}

/** DELETE /api/materials/:id. */
export function remove(materialId: number): Promise<DeletedResponse> {
  return request(`/api/materials/${materialId}`, { method: "DELETE" });
}

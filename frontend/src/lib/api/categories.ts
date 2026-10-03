/** /api/categories endpoints (the Library's user-defined categories). */

import { request } from "./client";
import type { CategoriesResponse, CategoryResponse, CreateCategoryRequest, OkResponse, ReorderCategoriesRequest, ReorderCategoriesResponse } from "./types";

/** GET /api/categories: a language's categories in order, with work counts. */
export function list(languageId: number): Promise<CategoriesResponse> {
  return request("/api/categories", { query: { languageId } });
}

/** POST /api/categories: 409 `errors.categoryNameTaken` for a case-insensitive duplicate, 400 for an empty or too-long name. */
export function create({ languageId, name }: CreateCategoryRequest): Promise<CategoryResponse> {
  return request("/api/categories", { method: "POST", body: { languageId, name: name.trim() } });
}

/** PATCH /api/categories/:id: renames; 409 or 400 as for create. */
export function rename(categoryId: number, name: string): Promise<CategoryResponse> {
  return request(`/api/categories/${categoryId}`, { method: "PATCH", body: { name: name.trim() } });
}

/** PUT /api/categories/order: persists the order; `ids` must be exactly the language's categories. */
export function reorder({ languageId, ids }: ReorderCategoriesRequest): Promise<ReorderCategoriesResponse> {
  return request("/api/categories/order", { method: "PUT", body: { languageId, ids } });
}

/** DELETE /api/categories/:id: its works become uncategorised, never deleted. */
export function remove(categoryId: number): Promise<OkResponse> {
  return request(`/api/categories/${categoryId}`, { method: "DELETE" });
}

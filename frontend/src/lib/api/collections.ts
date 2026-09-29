/** /api/collections/:id endpoints. */

import { request } from "./client";
import type { Collection, DeletedResponse } from "./types";

/** PATCH /api/collections/:id: moves a collection to another study language (409 on a name clash). */
export function updateLanguage(collectionId: number, languageId: number): Promise<Collection> {
  return request(`/api/collections/${collectionId}`, { method: "PATCH", body: { languageId } });
}

/** DELETE /api/collections/:id. */
export function remove(collectionId: number): Promise<DeletedResponse> {
  return request(`/api/collections/${collectionId}`, { method: "DELETE" });
}

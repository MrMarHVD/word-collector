/** /api/import endpoint (CSV word-list upload). */

import { request } from "./client";
import type { ImportWordsRequest, ImportWordsResponse } from "./types";

/** POST /api/import: bulk-imports word/translation rows into a new or existing collection (201). */
export function importWords(body: ImportWordsRequest): Promise<ImportWordsResponse> {
  return request("/api/import", { method: "POST", body });
}

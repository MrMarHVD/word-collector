/** /api/languages endpoints. */

import { request } from "./client";
import type { AddLanguageResponse, LanguagesResponse } from "./types";

/** GET /api/languages: the user's study languages and the supported options. */
export function list(): Promise<LanguagesResponse> {
  return request("/api/languages");
}

/** POST /api/languages: enrols the user in a study language (201). */
export function add(name: string): Promise<AddLanguageResponse> {
  return request("/api/languages", { method: "POST", body: { name } });
}

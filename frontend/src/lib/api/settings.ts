/** /api/settings endpoints. */

import { request } from "./client";
import type { ChangePasswordRequest, UpdateSettingsRequest, UpdateSettingsResponse } from "./types";

/** PATCH /api/settings: native language and practice session size. The returned user lacks the admin flags; merge it. */
export function update(body: UpdateSettingsRequest): Promise<UpdateSettingsResponse> {
  return request("/api/settings", { method: "PATCH", body });
}

/** POST /api/settings/password: revokes other sessions; the fresh CSRF token is rotated automatically. */
export function changePassword(body: ChangePasswordRequest): Promise<{ changed: true; csrfToken: string }> {
  return request("/api/settings/password", { method: "POST", body });
}

/** DELETE /api/settings/account: permanently deletes the account; `confirmation` must match the server's expected text. */
export function deleteAccount(confirmation: string): Promise<{ deleted: true; csrfToken: null }> {
  return request("/api/settings/account", { method: "DELETE", body: { confirmation } });
}

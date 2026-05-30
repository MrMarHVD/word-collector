import { t } from "./i18n.js";
import { state } from "./state.js";

let unauthorizedHandler = () => {};
const apiBaseUrl = globalThis.WORD_MARKER_API_BASE_URL || "";

// Central fetch wrapper normalizes API errors and handles expired sessions.
// Register a callback to run when an API response returns 401.
export function setUnauthorizedHandler(handler) {
  unauthorizedHandler = handler;
}

export function apiUrl(url) {
  return `${apiBaseUrl}${url}`;
}

// Send an API request, parse JSON, and throw localized errors on failure.
// Pass `handleUnauthorized: false` for endpoints where a 401 is an expected
// result (e.g. a wrong-password login) rather than an expired session — that
// keeps the global session-expired redirect from firing and lets the caller
// display the error in place.
export async function requestJson(url, options = {}) {
  const { handleUnauthorized = true, ...fetchOptions } = options;
  const response = await fetch(apiUrl(url), {
    headers: { "content-type": "application/json" },
    credentials: "include",
    ...fetchOptions
  });
  const payload = await response.json();
  if (response.status === 401 && handleUnauthorized) {
    state.user = null;
    unauthorizedHandler();
  }
  if (!response.ok) {
    throw new Error(payload.errorKey ? t(payload.errorKey) : payload.error || t("errors.requestFailed"));
  }
  return payload;
}

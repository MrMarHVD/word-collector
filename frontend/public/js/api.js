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

export function apiErrorMessage(payload) {
  return payload.errorKey ? t(payload.errorKey, payload.details || {}) : payload.error || t("errors.requestFailed");
}

const UNSAFE_METHODS = new Set(["POST", "PATCH", "DELETE"]);

async function refreshCsrfToken() {
  const response = await fetch(apiUrl("/api/auth/me"), {
    headers: { "content-type": "application/json" },
    credentials: "include"
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.errorKey ? t(payload.errorKey) : payload.error || t("errors.requestFailed"));
  }
  state.csrfToken = payload.csrfToken || null;
}

async function ensureCsrfToken() {
  if (!state.csrfToken) {
    await refreshCsrfToken();
  }
}

export async function csrfHeaders() {
  await ensureCsrfToken();
  return state.csrfToken ? { "x-csrf-token": state.csrfToken } : {};
}

// Send an API request, parse JSON, and throw localized errors on failure.
// Pass `handleUnauthorized: false` for endpoints where a 401 is an expected
// result (e.g. a wrong-password login) rather than an expired session — that
// keeps the global session-expired redirect from firing and lets the caller
// display the error in place.
export async function requestJson(url, options = {}) {
  const { handleUnauthorized = true, ...fetchOptions } = options;
  const method = String(fetchOptions.method || "GET").toUpperCase();
  const headers = {
    "content-type": "application/json",
    ...(UNSAFE_METHODS.has(method) ? await csrfHeaders() : {}),
    ...(fetchOptions.headers || {})
  };
  const response = await fetch(apiUrl(url), {
    ...fetchOptions,
    credentials: "include",
    headers
  });
  const payload = await response.json();
  if (payload.csrfToken !== undefined) {
    state.csrfToken = payload.csrfToken || null;
  }
  if (response.status === 401 && handleUnauthorized) {
    state.user = null;
    unauthorizedHandler();
  }
  if (!response.ok) {
    throw new Error(apiErrorMessage(payload));
  }
  return payload;
}

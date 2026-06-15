/**
 * @fileoverview Core HTTP client for the Word Marker API.
 *
 * Provides a central `fetch` wrapper (`requestJson`) that:
 *   - Resolves URLs against the runtime API base URL (`window.WORD_MARKER_API_BASE_URL`).
 *   - Automatically attaches `credentials: "include"` so the session cookie is sent.
 *   - Injects a CSRF token header for mutating requests (`POST`, `PATCH`, `DELETE`),
 *     lazily refreshing it via `GET /api/auth/me` when the token is absent.
 *   - Rotates the CSRF token from any response body that carries a `csrfToken` field.
 *   - Translates error payloads into localised `Error` instances.
 *   - Invokes a global unauthorised handler on HTTP 401 to redirect the user to the
 *     welcome/login screen. This behaviour can be suppressed per-call with
 *     `handleUnauthorized: false` for endpoints where a 401 is an expected outcome
 *     (e.g. a wrong-password login attempt).
 */

import { t } from "./i18n.js";
import { state } from "./state.js";

let unauthorizedHandler = () => {};
const apiBaseUrl = globalThis.WORD_MARKER_API_BASE_URL || "";

/**
 * Register a callback that is invoked whenever any API response returns HTTP 401.
 *
 * Use this to redirect the user to the login/welcome screen when their session
 * has expired. The handler replaces the no-op default set at module load time.
 *
 * @param {() => void} handler - Function to call on unauthorised responses.
 * @returns {void}
 */
// Central fetch wrapper normalizes API errors and handles expired sessions.
// Register a callback to run when an API response returns 401.
export function setUnauthorizedHandler(handler) {
  unauthorizedHandler = handler;
}

/**
 * Prepend the runtime API base URL to a path.
 *
 * @param {string} url - Absolute path, e.g. `"/api/words"`.
 * @returns {string} Fully-qualified URL string.
 */
export function apiUrl(url) {
  return `${apiBaseUrl}${url}`;
}

/**
 * Extract a human-readable error message from an API error payload.
 *
 * Prefers a localised string derived from `payload.errorKey` (with optional
 * `payload.details` interpolation values), falls back to `payload.error`, and
 * finally to the generic `"errors.requestFailed"` translation key.
 *
 * @param {{ errorKey?: string, details?: Record<string, unknown>, error?: string }} payload
 *   Parsed JSON body from a failed API response.
 * @returns {string} Localised error message suitable for display.
 */
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

/**
 * Return a headers object containing the CSRF token, fetching it first if absent.
 *
 * Returns an empty object when no CSRF token is available after the refresh
 * attempt, so callers can spread the result unconditionally.
 *
 * @returns {Promise<{"x-csrf-token": string}|{}>} Header map, possibly empty.
 */
export async function csrfHeaders() {
  await ensureCsrfToken();
  return state.csrfToken ? { "x-csrf-token": state.csrfToken } : {};
}

/**
 * Send an authenticated JSON API request and return the parsed response body.
 *
 * Automatically:
 *   - Prepends the API base URL via {@link apiUrl}.
 *   - Sends cookies with `credentials: "include"`.
 *   - Adds `"content-type": "application/json"` to every request.
 *   - Injects the CSRF token header for `POST`, `PATCH`, and `DELETE` requests.
 *   - Rotates `state.csrfToken` from any response body that includes `csrfToken`.
 *   - Calls the registered unauthorised handler on HTTP 401 (unless suppressed).
 *   - Throws a localised `Error` for any non-2xx response.
 *
 * Pass `handleUnauthorized: false` for endpoints where a 401 is an expected
 * result (e.g. a wrong-password login) rather than an expired session — that
 * keeps the global session-expired redirect from firing and lets the caller
 * display the error in place.
 *
 * @param {string} url - API path, e.g. `"/api/words"`.
 * @param {RequestInit & { handleUnauthorized?: boolean }} [options={}]
 *   Standard `fetch` options plus the optional `handleUnauthorized` flag
 *   (default `true`).
 * @returns {Promise<object>} Parsed JSON response body.
 * @throws {Error} Localised error message from the response payload on failure.
 */
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

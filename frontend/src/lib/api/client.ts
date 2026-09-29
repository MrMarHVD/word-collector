/**
 * Core HTTP client for the Supergloss API, ported from public/js/api.js.
 *
 * - Requests are same-origin (`/api/*`, proxied to the backend by Vite in dev)
 *   and always send the session cookie.
 * - Unsafe methods (POST, PATCH, DELETE) carry the `x-csrf-token` header; the
 *   token is fetched lazily from GET /api/auth/me and rotated from any
 *   response body that contains `csrfToken`. A request the server rejects
 *   with `errors.csrfInvalid` (the token expired or belongs to an older
 *   session) is retried once with a freshly fetched token.
 * - Non-2xx responses throw an `ApiError` whose message is localised from
 *   `errorKey` (+ `details`), else the server's `error`, else
 *   "errors.requestFailed".
 * - HTTP 401 invokes the registered unauthorised handler (the session store
 *   drops the user, which gates the UI back to the welcome screen) unless the
 *   call passes `handleUnauthorized: false`.
 */

import { t } from "@/lib/i18n";

export type QueryValue = string | number | boolean | null | undefined;

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  /** JSON-serialised unless it is FormData (sent as multipart without a content-type). */
  body?: unknown;
  /** Appended as a query string; null, undefined and "" values are skipped. */
  query?: Record<string, QueryValue>;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** Set false where a 401 is an expected outcome (e.g. a wrong password) rather than an expired session. */
  handleUnauthorized?: boolean;
}

/** Error payload shape the backend returns on failure. */
export interface ApiErrorPayload {
  error?: string;
  errorKey?: string;
  details?: Record<string, string | number>;
  [key: string]: unknown;
}

/** Thrown for every non-2xx response; `message` is already localised for display. */
export class ApiError extends Error {
  readonly status: number;
  readonly errorKey?: string;
  readonly details?: Record<string, string | number>;
  readonly payload: ApiErrorPayload;

  constructor(status: number, payload: ApiErrorPayload) {
    super(apiErrorMessage(payload));
    this.name = "ApiError";
    this.status = status;
    this.errorKey = payload.errorKey;
    this.details = payload.details;
    this.payload = payload;
  }
}

const UNSAFE_METHODS = new Set(["POST", "PATCH", "DELETE"]);
const CSRF_INVALID_ERROR_KEY = "errors.csrfInvalid";

let csrfToken: string | null = null;
let unauthorizedHandler: () => void = () => {};

/** Registers the callback run on any HTTP 401 (unless the call opts out). */
export function setUnauthorizedHandler(handler: () => void): void {
  unauthorizedHandler = handler;
}

/** Current CSRF token, or null when not yet fetched or after logout. */
export function getCsrfToken(): string | null {
  return csrfToken;
}

/** Replaces the CSRF token (null forces a refetch before the next unsafe request). */
export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

/** Resolves an API path to a URL. The API is same-origin, so this is the path itself; kept for full-page redirects like OAuth. */
export function apiUrl(path: string): string {
  return path;
}

/** Whether a response is the server's CSRF rejection (token missing, expired or bound to another session). */
export function isCsrfRejection(status: number, errorKey: unknown): boolean {
  return status === 403 && errorKey === CSRF_INVALID_ERROR_KEY;
}

/** Localised message for an API error payload. */
export function apiErrorMessage(payload: ApiErrorPayload): string {
  return payload.errorKey ? t(payload.errorKey, payload.details || {}) : payload.error || t("errors.requestFailed");
}

function withQuery(path: string, query?: Record<string, QueryValue>): string {
  if (!query) {
    return path;
  }
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(query)) {
    if (value !== null && value !== undefined && value !== "") {
      params.set(name, String(value));
    }
  }
  const search = params.toString();
  return search ? `${path}?${search}` : path;
}

async function readPayload(response: Response): Promise<Record<string, unknown>> {
  try {
    const payload: unknown = await response.json();
    return payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

async function refreshCsrfToken(): Promise<void> {
  const response = await fetch(apiUrl("/api/auth/me"), {
    headers: { "content-type": "application/json" },
    credentials: "include"
  });
  const payload = await readPayload(response);
  if (!response.ok) {
    throw new ApiError(response.status, payload);
  }
  csrfToken = typeof payload.csrfToken === "string" ? payload.csrfToken : null;
}

/** Header map carrying the CSRF token, fetching the token first when absent; empty when none is available. */
export async function csrfHeaders(): Promise<Record<string, string>> {
  if (!csrfToken) {
    await refreshCsrfToken();
  }
  return csrfToken ? { "x-csrf-token": csrfToken } : {};
}

async function send(path: string, options: RequestOptions): Promise<Response> {
  const { method = "GET", body, query, headers = {}, signal } = options;
  const isForm = body instanceof FormData;
  return fetch(apiUrl(withQuery(path, query)), {
    method,
    credentials: "include",
    signal,
    headers: {
      ...(isForm ? {} : { "content-type": "application/json" }),
      ...(UNSAFE_METHODS.has(method) ? await csrfHeaders() : {}),
      ...headers
    },
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body)
  });
}

/** Sends an API request and returns the parsed JSON body typed as `T`. Throws `ApiError` on non-2xx. */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", handleUnauthorized = true } = options;
  let response = await send(path, options);
  let payload = await readPayload(response);
  if (UNSAFE_METHODS.has(method) && isCsrfRejection(response.status, payload.errorKey)) {
    // The token outlived its 24 h lifetime or its session: fetch a fresh one and retry once.
    csrfToken = null;
    response = await send(path, options);
    payload = await readPayload(response);
  }
  if (payload.csrfToken !== undefined) {
    csrfToken = typeof payload.csrfToken === "string" && payload.csrfToken ? payload.csrfToken : null;
  }
  if (response.status === 401 && handleUnauthorized) {
    unauthorizedHandler();
  }
  if (!response.ok) {
    throw new ApiError(response.status, payload as ApiErrorPayload);
  }
  return payload as T;
}

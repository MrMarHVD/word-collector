/** /api/auth/* endpoints. Credential and token endpoints opt out of the global 401 redirect, as in the legacy client. */

import { apiUrl, request } from "./client";
import type { AuthResponse, Credentials, RegisterRequest, ResetPasswordRequest, SessionResponse } from "./types";

/** GET /api/auth/me: session bootstrap (user or null, languages, options, providers, CSRF token). */
export function me(): Promise<SessionResponse> {
  return request("/api/auth/me");
}

/** POST /api/auth/login. 401 = wrong credentials (not redirected), 429 = rate limited. */
export function login(body: Credentials): Promise<AuthResponse> {
  return request("/api/auth/login", { method: "POST", body, handleUnauthorized: false });
}

/** POST /api/auth/register (201). */
export function register(body: RegisterRequest): Promise<AuthResponse> {
  return request("/api/auth/register", { method: "POST", body, handleUnauthorized: false });
}

/** POST /api/auth/logout. */
export function logout(): Promise<{ loggedOut: true }> {
  return request("/api/auth/logout", { method: "POST" });
}

/** POST /api/auth/resend-verification for the signed-in user. */
export function resendVerification(): Promise<{ sent: true }> {
  return request("/api/auth/resend-verification", { method: "POST" });
}

/** POST /api/auth/verify-email with the emailed token. */
export function verifyEmail(token: string): Promise<{ verified: true }> {
  return request("/api/auth/verify-email", { method: "POST", body: { token }, handleUnauthorized: false });
}

/** POST /api/auth/request-password-reset; always succeeds to avoid account enumeration. */
export function requestPasswordReset(email: string): Promise<{ requested: true }> {
  return request("/api/auth/request-password-reset", { method: "POST", body: { email }, handleUnauthorized: false });
}

/** POST /api/auth/reset-password with the emailed token; revokes all sessions. */
export function resetPassword(body: ResetPasswordRequest): Promise<{ reset: true }> {
  return request("/api/auth/reset-password", { method: "POST", body, handleUnauthorized: false });
}

/** URL of GET /api/auth/google/start; navigate the window there to begin Google OAuth. */
export function googleStartUrl(): string {
  return apiUrl("/api/auth/google/start");
}

/**
 * @fileoverview Google OAuth 2.0 sign-in helpers.
 *
 * Implements the server-side leg of the OAuth Authorization Code flow for Google
 * sign-in.  The module handles state-token creation and verification (CSRF
 * protection for the redirect), the authorization URL, code exchange, and ID
 * token verification via Google's tokeninfo endpoint.
 *
 * State tokens are short-lived (10 min), HMAC-signed with `JWT_SECRET`, and
 * stored as `HttpOnly` cookies scoped to `/api/auth/google` so they cannot be
 * read by client-side JavaScript or replayed against unrelated paths.
 *
 * Google OAuth is only active when both `GOOGLE_OAUTH_CLIENT_ID` and
 * `GOOGLE_OAUTH_CLIENT_SECRET` are configured; callers should gate on
 * {@link googleOAuthConfigured} before exposing the sign-in route.
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import {
  APP_URL,
  GOOGLE_OAUTH_CLIENT_ID,
  GOOGLE_OAUTH_CLIENT_SECRET,
  GOOGLE_OAUTH_REDIRECT_URI,
  IS_PRODUCTION,
  JWT_SECRET
} from "../config.js";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo";
const GOOGLE_STATE_COOKIE = "word_collector_google_oauth_state";
const STATE_TTL_SECONDS = 10 * 60;
const GOOGLE_SCOPES = ["openid", "email", "profile"];

function appendSetCookie(res, cookie) {
  const existing = res.getHeader?.("set-cookie");
  if (!existing) {
    res.setHeader("set-cookie", cookie);
  } else if (Array.isArray(existing)) {
    res.setHeader("set-cookie", [...existing, cookie]);
  } else {
    res.setHeader("set-cookie", [existing, cookie]);
  }
}

function stateCookieAttributes(maxAgeSeconds) {
  const parts = ["HttpOnly", "SameSite=Lax", "Path=/api/auth/google", `Max-Age=${maxAgeSeconds}`];
  if (IS_PRODUCTION) {
    parts.push("Secure");
  }
  return parts.join("; ");
}

function sign(data) {
  return createHmac("sha256", JWT_SECRET).update(data).digest("base64url");
}

function safeEqual(a, b) {
  const actual = Buffer.from(String(a || ""));
  const expected = Buffer.from(String(b || ""));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function createStateToken() {
  const payload = {
    nonce: randomBytes(24).toString("base64url"),
    exp: Math.floor(Date.now() / 1000) + STATE_TTL_SECONDS
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encodedPayload}.${sign(encodedPayload)}`;
}

function verifyStateToken(state) {
  const [encodedPayload, signature, extra] = String(state || "").split(".");
  if (!encodedPayload || !signature || extra !== undefined || !safeEqual(signature, sign(encodedPayload))) {
    return false;
  }
  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
    return Number(payload.exp) > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

function appRedirect(params = {}) {
  const url = new URL(APP_URL);
  Object.entries(params).forEach(([key, value]) => {
    if (value) {
      url.searchParams.set(key, value);
    }
  });
  return url.toString();
}

/**
 * Returns `true` when both Google OAuth credentials are present in the
 * environment, indicating the sign-in flow can be offered to users.
 *
 * @returns {boolean}
 */
export function googleOAuthConfigured() {
  return Boolean(GOOGLE_OAUTH_CLIENT_ID && GOOGLE_OAUTH_CLIENT_SECRET);
}

/**
 * Generates the Google authorization URL that the browser should be redirected
 * to when the user clicks "Sign in with Google".
 *
 * A signed, time-limited state token is minted and written as an `HttpOnly`
 * cookie (`word_collector_google_oauth_state`) so it can be verified on return.
 * The cookie is scoped to `/api/auth/google` to minimise exposure.
 *
 * @param {import("node:http").ServerResponse} res - Response object used to set the state cookie.
 * @returns {string} The fully-qualified Google authorization URL.
 */
export function googleOAuthStartUrl(res) {
  const state = createStateToken();
  appendSetCookie(res, `${GOOGLE_STATE_COOKIE}=${encodeURIComponent(state)}; ${stateCookieAttributes(STATE_TTL_SECONDS)}`);
  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set("client_id", GOOGLE_OAUTH_CLIENT_ID);
  url.searchParams.set("redirect_uri", GOOGLE_OAUTH_REDIRECT_URI);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_SCOPES.join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("access_type", "online");
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

/**
 * Expires the OAuth state cookie on the client by setting `Max-Age=0`.
 * Should be called on both successful and failed callback handling so the
 * one-time cookie is never left in the browser.
 *
 * @param {import("node:http").ServerResponse} res
 */
export function clearGoogleOAuthStateCookie(res) {
  appendSetCookie(res, `${GOOGLE_STATE_COOKIE}=; ${stateCookieAttributes(0)}`);
}

/**
 * Verifies the OAuth `state` parameter returned by Google against the state
 * cookie stored in the browser.  Both the cookie/parameter equality check and
 * the HMAC signature + expiry of the state token must pass for this to return
 * `true`, preventing CSRF attacks on the callback endpoint.
 *
 * @param {import("node:http").IncomingMessage} req - Incoming callback request (used to read the state cookie).
 * @param {string} state - The `state` query parameter from the Google redirect.
 * @returns {boolean}
 */
export function verifyGoogleOAuthState(req, state) {
  const cookieValue = String(req.headers.cookie || "")
    .split(";")
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${GOOGLE_STATE_COOKIE}=`))
    ?.slice(GOOGLE_STATE_COOKIE.length + 1);
  const cookieState = cookieValue ? decodeURIComponent(cookieValue) : "";
  return safeEqual(cookieState, state) && verifyStateToken(state);
}

/**
 * Exchanges a Google authorization code for tokens by calling Google's token
 * endpoint.  The `fetchImpl` parameter is injectable for testing.
 *
 * @param {string} code - The authorization code from the Google callback.
 * @param {typeof fetch} [fetchImpl] - Fetch implementation (defaults to global `fetch`).
 * @returns {Promise<{id_token: string, access_token: string, [key: string]: unknown}>}
 *   The raw token response from Google.
 * @throws {Error} When the HTTP request fails or Google returns an error response.
 */
export async function exchangeGoogleOAuthCode(code, fetchImpl = fetch) {
  const body = new URLSearchParams({
    client_id: GOOGLE_OAUTH_CLIENT_ID,
    client_secret: GOOGLE_OAUTH_CLIENT_SECRET,
    code,
    grant_type: "authorization_code",
    redirect_uri: GOOGLE_OAUTH_REDIRECT_URI
  });
  const response = await fetchImpl(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });
  const payload = await response.json();
  if (!response.ok || !payload.id_token) {
    throw new Error(payload.error_description || payload.error || "Google token exchange failed.");
  }
  return payload;
}

/**
 * Verifies a Google ID token by calling Google's tokeninfo endpoint and
 * checking the `aud` claim matches this application's client ID.
 *
 * Using the tokeninfo endpoint (rather than local JWKS verification) keeps the
 * implementation dependency-free and avoids key-rotation concerns.
 *
 * @param {string} idToken - The `id_token` from the token exchange response.
 * @param {typeof fetch} [fetchImpl] - Fetch implementation (defaults to global `fetch`).
 * @returns {Promise<{providerUserId: string, email: string, emailVerified: boolean, displayName: string}>}
 * @throws {Error} When the token is invalid, expired, or the audience does not match.
 */
export async function verifyGoogleIdToken(idToken, fetchImpl = fetch) {
  const response = await fetchImpl(`${GOOGLE_TOKENINFO_URL}?id_token=${encodeURIComponent(idToken)}`);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error_description || payload.error || "Google ID token verification failed.");
  }
  if (payload.aud !== GOOGLE_OAUTH_CLIENT_ID) {
    throw new Error("Google ID token audience does not match this app.");
  }
  return {
    providerUserId: payload.sub,
    email: payload.email,
    emailVerified: payload.email_verified === "true" || payload.email_verified === true,
    displayName: payload.name || ""
  };
}

/**
 * Issues a `302` redirect to the configured `APP_URL`, optionally appending
 * query parameters (e.g. `error` on failure or a post-login destination).
 * Parameters with falsy values are omitted from the URL.
 *
 * @param {import("node:http").ServerResponse} res
 * @param {Record<string, string>} [params] - Query parameters to append to `APP_URL`.
 */
export function redirectToApp(res, params = {}) {
  res.statusCode = 302;
  res.setHeader("location", appRedirect(params));
  res.end();
}

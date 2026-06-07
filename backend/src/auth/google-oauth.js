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

export function googleOAuthConfigured() {
  return Boolean(GOOGLE_OAUTH_CLIENT_ID && GOOGLE_OAUTH_CLIENT_SECRET);
}

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

export function clearGoogleOAuthStateCookie(res) {
  appendSetCookie(res, `${GOOGLE_STATE_COOKIE}=; ${stateCookieAttributes(0)}`);
}

export function verifyGoogleOAuthState(req, state) {
  const cookieValue = String(req.headers.cookie || "")
    .split(";")
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${GOOGLE_STATE_COOKIE}=`))
    ?.slice(GOOGLE_STATE_COOKIE.length + 1);
  const cookieState = cookieValue ? decodeURIComponent(cookieValue) : "";
  return safeEqual(cookieState, state) && verifyStateToken(state);
}

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

export function redirectToApp(res, params = {}) {
  res.statusCode = 302;
  res.setHeader("location", appRedirect(params));
  res.end();
}

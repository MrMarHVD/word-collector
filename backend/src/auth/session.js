import { AUTH_COOKIE, IS_PRODUCTION, JWT_TTL_SECONDS } from "../config.js";
import { jsonResponse } from "../http/response.js";
import { createCsrfToken, verifyCsrfToken } from "./csrf.js";
import { generateToken, hashToken } from "./tokens.js";

// Sessions are opaque, server-side, and revocable. The cookie carries a random
// token; only its SHA-256 hash is stored in the `sessions` table, so the server
// can invalidate any session (logout, logout-everywhere, password change) and a
// database leak never exposes a usable cookie.

const SESSION_TTL_SECONDS = JWT_TTL_SECONDS;

// Build the Set-Cookie attributes. `Secure` is only added in production, where
// TLS is terminated upstream, so local HTTP development still works.
function cookieAttributes(maxAgeSeconds) {
  const parts = ["HttpOnly", "SameSite=Lax", "Path=/", `Max-Age=${maxAgeSeconds}`];
  if (IS_PRODUCTION) {
    parts.push("Secure");
  }
  return parts.join("; ");
}

// Parse the Cookie header into decoded key-value pairs.
export function parseCookies(req) {
  return Object.fromEntries(
    String(req.headers.cookie || "")
      .split(";")
      .map((cookie) => cookie.trim())
      .filter(Boolean)
      .map((cookie) => {
        const index = cookie.indexOf("=");
        return [decodeURIComponent(cookie.slice(0, index)), decodeURIComponent(cookie.slice(index + 1))];
      })
  );
}

// Attach the session cookie to a response.
export function setAuthCookie(res, token) {
  res.setHeader("set-cookie", `${AUTH_COOKIE}=${encodeURIComponent(token)}; ${cookieAttributes(SESSION_TTL_SECONDS)}`);
}

// Expire the session cookie on the client.
export function clearAuthCookie(res) {
  res.setHeader("set-cookie", `${AUTH_COOKIE}=; ${cookieAttributes(0)}`);
}

// Build request authentication helpers around the user/session repository.
export function createSessionHelpers(authRepository) {
  // Resolve the session token from the cookie to its stored hash.
  function sessionIdFromRequest(req) {
    const token = parseCookies(req)[AUTH_COOKIE];
    return token ? hashToken(token) : null;
  }

  function createCsrfTokenForRequest(req) {
    return createCsrfToken(sessionIdFromRequest(req));
  }

  function verifyCsrfTokenForRequest(req) {
    return verifyCsrfToken(req.headers["x-csrf-token"], sessionIdFromRequest(req));
  }

  // Look up the active (non-expired) session and its user.
  async function getAuthenticatedUser(req) {
    const sessionId = sessionIdFromRequest(req);
    if (!sessionId) {
      return null;
    }
    const user = await authRepository.findSessionUser(sessionId);
    if (!user) {
      return null;
    }
    return { userId: user.id, email: user.email, emailVerified: user.emailVerified === true, sessionId };
  }

  // Require a valid user or write a 401 response.
  async function requireUser(req, res) {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      jsonResponse(res, 401, { error: "Authentication required." });
      return null;
    }
    return user;
  }

  // Create a new session row for a user and set the session cookie.
  async function createSessionForUser(res, user) {
    const { raw, hash } = generateToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();
    await authRepository.createSession(hash, user.id, expiresAt);
    setAuthCookie(res, raw);
    return { sessionId: hash, csrfToken: createCsrfToken(hash) };
  }

  // Destroy the current session (logout) and clear the cookie.
  async function destroyCurrentSession(req, res) {
    const sessionId = sessionIdFromRequest(req);
    if (sessionId) {
      await authRepository.deleteSession(sessionId);
    }
    clearAuthCookie(res);
  }

  // Revoke every session for a user (e.g. after a password reset).
  async function destroyAllUserSessions(userId) {
    await authRepository.deleteUserSessions(userId);
  }

  return {
    getAuthenticatedUser,
    createCsrfTokenForRequest,
    verifyCsrfTokenForRequest,
    requireUser,
    createSessionForUser,
    destroyCurrentSession,
    destroyAllUserSessions
  };
}

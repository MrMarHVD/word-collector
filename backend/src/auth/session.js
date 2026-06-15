/**
 * @fileoverview Server-side session management.
 *
 * Sessions are opaque and stored in the `sessions` database table.  The browser
 * receives only a random token via `HttpOnly` cookie; its SHA-256 hash is the
 * server-side identifier.  This design allows any session (or all sessions for a
 * user) to be invalidated server-side without changing the user's password, and
 * means a database leak never exposes a usable credential.
 *
 * {@link createSessionHelpers} wires the low-level cookie utilities together with
 * the auth repository so route handlers can authenticate requests with a single
 * `await requireUser(req, res)` call.
 */

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

/**
 * Parses the `Cookie` request header into a plain object of decoded key-value
 * pairs.  Both keys and values are URI-decoded.
 *
 * @param {import("node:http").IncomingMessage} req
 * @returns {Record<string, string>}
 */
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

/**
 * Writes the session token as an `HttpOnly` auth cookie on the response.
 * The cookie lifetime matches `SESSION_TTL_SECONDS`.  `Secure` is added only in
 * production where TLS is terminated upstream.
 *
 * @param {import("node:http").ServerResponse} res
 * @param {string} token - The raw (plaintext) session token to set.
 */
export function setAuthCookie(res, token) {
  appendSetCookie(res, `${AUTH_COOKIE}=${encodeURIComponent(token)}; ${cookieAttributes(SESSION_TTL_SECONDS)}`);
}

/**
 * Instructs the browser to delete the auth cookie by setting `Max-Age=0`.
 *
 * @param {import("node:http").ServerResponse} res
 */
export function clearAuthCookie(res) {
  appendSetCookie(res, `${AUTH_COOKIE}=; ${cookieAttributes(0)}`);
}

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

/**
 * Creates a set of request-scoped authentication helpers bound to the given
 * auth repository.  All session lookups go through this object so route
 * handlers never touch cookies or hashing directly.
 *
 * @param {object} authRepository - Repository with session and user queries
 *   (`findSessionUser`, `createSession`, `deleteSession`, `deleteUserSessions`).
 * @returns {{
 *   getAuthenticatedUser: (req: import("node:http").IncomingMessage) => Promise<{userId: number, email: string, emailVerified: boolean, hasPassword: boolean, sessionId: string} | null>,
 *   createCsrfTokenForRequest: (req: import("node:http").IncomingMessage) => string,
 *   verifyCsrfTokenForRequest: (req: import("node:http").IncomingMessage) => boolean,
 *   requireUser: (req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) => Promise<{userId: number, email: string, emailVerified: boolean, hasPassword: boolean, sessionId: string} | null>,
 *   createSessionForUser: (res: import("node:http").ServerResponse, user: {id: number}) => Promise<{sessionId: string, csrfToken: string}>,
 *   destroyCurrentSession: (req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) => Promise<void>,
 *   destroyAllUserSessions: (userId: number) => Promise<void>
 * }}
 */
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
    return { userId: user.id, email: user.email, emailVerified: user.emailVerified === true, hasPassword: user.hasPassword === true, sessionId };
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

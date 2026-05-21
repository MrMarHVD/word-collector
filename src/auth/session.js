import { AUTH_COOKIE, JWT_TTL_SECONDS } from "../config.js";
import { jsonResponse } from "../http/response.js";
import { createJwt, verifyJwt } from "./jwt.js";

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

export function setAuthCookie(res, token) {
  res.setHeader("set-cookie", `${AUTH_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${JWT_TTL_SECONDS}`);
}

export function clearAuthCookie(res) {
  res.setHeader("set-cookie", `${AUTH_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

export function createSessionHelpers(statements) {
  function getAuthenticatedUser(req) {
    const token = parseCookies(req)[AUTH_COOKIE];
    const payload = verifyJwt(token);
    if (!payload) {
      return null;
    }
    const user = statements.userById.get(Number(payload.sub));
    if (!user || user.email !== payload.email) {
      return null;
    }
    return { userId: user.id, email: user.email };
  }

  function requireUser(req, res) {
    const user = getAuthenticatedUser(req);
    if (!user) {
      jsonResponse(res, 401, { error: "Authentication required." });
      return null;
    }
    return user;
  }

  function setJwtForUser(res, user) {
    setAuthCookie(res, createJwt(user));
  }

  return { getAuthenticatedUser, requireUser, setJwtForUser };
}

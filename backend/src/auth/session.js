import { AUTH_COOKIE, JWT_TTL_SECONDS } from "../config.js";
import { jsonResponse } from "../http/response.js";
import { createJwt, verifyJwt } from "./jwt.js";

// Cookie helpers isolate auth transport from route behavior.
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

// Attach the auth JWT cookie to a response.
export function setAuthCookie(res, token) {
  res.setHeader("set-cookie", `${AUTH_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${JWT_TTL_SECONDS}`);
}

// Expire the auth cookie on the client.
export function clearAuthCookie(res) {
  res.setHeader("set-cookie", `${AUTH_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

// Build request authentication helpers around the user repository.
export function createSessionHelpers(authRepository) {
  // Verify the token and then require the referenced user row to still exist.
  function getAuthenticatedUser(req) {
    const token = parseCookies(req)[AUTH_COOKIE];
    const payload = verifyJwt(token);
    if (!payload) {
      return null;
    }
    const user = authRepository.findUserById(Number(payload.sub));
    if (!user || user.email !== payload.email) {
      return null;
    }
    return { userId: user.id, email: user.email };
  }

  // Require a valid user or write a 401 response.
  function requireUser(req, res) {
    const user = getAuthenticatedUser(req);
    if (!user) {
      jsonResponse(res, 401, { error: "Authentication required." });
      return null;
    }
    return user;
  }

  // Create a JWT for a user and attach it as the auth cookie.
  function setJwtForUser(res, user) {
    setAuthCookie(res, createJwt(user));
  }

  return { getAuthenticatedUser, requireUser, setJwtForUser };
}

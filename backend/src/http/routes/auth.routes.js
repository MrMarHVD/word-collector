import { NATIVE_LANGUAGE_OPTIONS, STUDY_LANGUAGE_OPTIONS } from "../../config.js";
import {
  clearGoogleOAuthStateCookie,
  exchangeGoogleOAuthCode,
  googleOAuthConfigured,
  googleOAuthStartUrl,
  redirectToApp,
  verifyGoogleIdToken,
  verifyGoogleOAuthState
} from "../../auth/google-oauth.js";
import {
  createPasswordReset,
  createVerificationToken,
  getAuthContext,
  loginWithOAuthProfile,
  loginUser,
  registerUser,
  resetPassword,
  verifyEmail
} from "../../modules/auth/auth.service.js";
import { clientIp, createRateLimiter, enforceRateLimit } from "../rate-limit.js";
import { readJson } from "../request.js";
import { jsonResponse } from "../response.js";

// Public user shape returned to the client; never leak password material.
function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    nativeLanguage: user.nativeLanguage,
    practiceWordsPerSession: user.practiceWordsPerSession,
    emailVerified: user.emailVerified === true,
    hasPassword: user.hasPassword === true
  };
}

export function createAuthRoutes({
  repositories,
  emailService,
  getAuthenticatedUser,
  createCsrfTokenForRequest,
  createSessionForUser,
  destroyCurrentSession
}) {
  // Per-IP throttles on the abuse-prone endpoints. Credential checks are the
  // tightest; email-triggering endpoints are limited to curb mail flooding.
  const loginLimiter = createRateLimiter({ max: 10, windowMs: 15 * 60 * 1000 });
  const registerLimiter = createRateLimiter({ max: 5, windowMs: 60 * 60 * 1000 });
  const emailLimiter = createRateLimiter({ max: 5, windowMs: 60 * 60 * 1000 });

  // Issue and email a verification link. Failures to send are logged but never
  // surfaced to the client or allowed to break the surrounding flow.
  async function sendVerificationEmail(user) {
    try {
      const raw = await createVerificationToken(repositories, user.id);
      await emailService.sendVerification(user, raw);
    } catch (error) {
      console.error(`Failed to send verification email to ${user.email}: ${error.message}`);
    }
  }

  return async function handleAuthRoutes(req, res, url) {
    if (req.method === "GET" && url.pathname === "/api/auth/me") {
      const user = await getAuthenticatedUser(req);
      if (!user) {
        jsonResponse(res, 200, {
          csrfToken: createCsrfTokenForRequest(req),
          user: null,
          languages: [],
          predefinedLanguages: await repositories.languages.listPredefined(),
          studyLanguageOptions: STUDY_LANGUAGE_OPTIONS,
          nativeLanguageOptions: NATIVE_LANGUAGE_OPTIONS,
          authProviders: { google: googleOAuthConfigured() }
        });
        return true;
      }
      const context = await getAuthContext(repositories, user.userId);
      jsonResponse(res, 200, {
        csrfToken: createCsrfTokenForRequest(req),
        ...context,
        studyLanguageOptions: STUDY_LANGUAGE_OPTIONS,
        nativeLanguageOptions: NATIVE_LANGUAGE_OPTIONS,
        authProviders: { google: googleOAuthConfigured() }
      });
      return true;
    }

    if (req.method === "GET" && url.pathname === "/api/auth/google/start") {
      if (!googleOAuthConfigured()) {
        redirectToApp(res, { oauth_error: "google_not_configured" });
        return true;
      }
      res.statusCode = 302;
      res.setHeader("location", googleOAuthStartUrl(res));
      res.end();
      return true;
    }

    if (req.method === "GET" && url.pathname === "/api/auth/google/callback") {
      clearGoogleOAuthStateCookie(res);
      if (!googleOAuthConfigured()) {
        redirectToApp(res, { oauth_error: "google_not_configured" });
        return true;
      }
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const googleError = url.searchParams.get("error");
      if (googleError) {
        redirectToApp(res, { oauth_error: "google_denied" });
        return true;
      }
      if (!code || !state || !verifyGoogleOAuthState(req, state)) {
        redirectToApp(res, { oauth_error: "google_state_invalid" });
        return true;
      }
      try {
        const tokens = await exchangeGoogleOAuthCode(code);
        const profile = await verifyGoogleIdToken(tokens.id_token);
        const result = await loginWithOAuthProfile(repositories, profile);
        if (result.error) {
          redirectToApp(res, { oauth_error: result.errorKey || "google_failed" });
          return true;
        }
        await createSessionForUser(res, result.user);
        redirectToApp(res, { oauth: "success" });
      } catch (error) {
        console.error(`Google OAuth failed: ${error.message}`);
        redirectToApp(res, { oauth_error: "google_failed" });
      }
      return true;
    }

    if (req.method === "POST" && url.pathname === "/api/auth/login") {
      if (!enforceRateLimit(res, loginLimiter, clientIp(req))) {
        return true;
      }
      const body = await readJson(req);
      const result = await loginUser(repositories, body.email, body.password);
      if (result.error) {
        jsonResponse(res, result.status, { error: result.error, errorKey: result.errorKey });
        return true;
      }
      const session = await createSessionForUser(res, result.user);
      jsonResponse(res, 200, { csrfToken: session.csrfToken, user: publicUser(result.user) });
      return true;
    }

    if (req.method === "POST" && url.pathname === "/api/auth/register") {
      if (!enforceRateLimit(res, registerLimiter, clientIp(req))) {
        return true;
      }
      const body = await readJson(req);
      const result = await registerUser(repositories, body.email, body.password, body.confirmPassword);
      if (result.error) {
        jsonResponse(res, result.status, { error: result.error, errorKey: result.errorKey });
        return true;
      }
      const session = await createSessionForUser(res, result.user);
      await sendVerificationEmail(result.user);
      jsonResponse(res, 201, { csrfToken: session.csrfToken, user: publicUser(result.user) });
      return true;
    }

    if (req.method === "POST" && url.pathname === "/api/auth/logout") {
      await destroyCurrentSession(req, res);
      jsonResponse(res, 200, { loggedOut: true });
      return true;
    }

    // Re-send a verification email to the signed-in user (soft-gate banner).
    if (req.method === "POST" && url.pathname === "/api/auth/resend-verification") {
      const user = await getAuthenticatedUser(req);
      if (!user) {
        jsonResponse(res, 401, { error: "Authentication required.", errorKey: "errors.authenticationRequired" });
        return true;
      }
      if (!enforceRateLimit(res, emailLimiter, clientIp(req))) {
        return true;
      }
      if (!user.emailVerified) {
        await sendVerificationEmail({ id: user.userId, email: user.email });
      }
      jsonResponse(res, 200, { sent: true });
      return true;
    }

    // Consume an emailed verification token.
    if (req.method === "POST" && url.pathname === "/api/auth/verify-email") {
      const body = await readJson(req);
      const result = await verifyEmail(repositories, body.token);
      if (result.error) {
        jsonResponse(res, result.status, { error: result.error, errorKey: result.errorKey });
        return true;
      }
      jsonResponse(res, 200, { verified: true });
      return true;
    }

    // Begin a password reset. Always responds 200 to avoid account enumeration.
    if (req.method === "POST" && url.pathname === "/api/auth/request-password-reset") {
      if (!enforceRateLimit(res, emailLimiter, clientIp(req))) {
        return true;
      }
      const body = await readJson(req);
      const result = await createPasswordReset(repositories, body.email);
      if (result.user && result.raw) {
        try {
          await emailService.sendPasswordReset(result.user, result.raw);
        } catch (error) {
          console.error(`Failed to send password-reset email to ${result.user.email}: ${error.message}`);
        }
      }
      jsonResponse(res, 200, { requested: true });
      return true;
    }

    // Complete a password reset with the emailed token; revokes all sessions.
    if (req.method === "POST" && url.pathname === "/api/auth/reset-password") {
      const body = await readJson(req);
      const result = await resetPassword(repositories, body.token, body.password, body.confirmPassword);
      if (result.error) {
        jsonResponse(res, result.status, { error: result.error, errorKey: result.errorKey });
        return true;
      }
      jsonResponse(res, 200, { reset: true });
      return true;
    }

    return false;
  };
}

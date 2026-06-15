/**
 * @fileoverview Top-level API request dispatcher.
 *
 * Wires together all domain-specific route factories into two ordered chains:
 *   - **Public routes** — handled before session validation (auth endpoints).
 *   - **Authenticated routes** — only reached after a valid session is confirmed.
 *
 * CSRF validation is enforced here for every unsafe method (POST, PATCH, DELETE)
 * before any route logic runs, so individual route handlers do not need to
 * repeat the check.
 *
 * Route handlers follow a middleware-like convention: each returns `true` if it
 * handled the request (response already written) or `false` to pass to the next
 * handler. A 404 is sent if no handler claims the request.
 */

import { createSessionHelpers } from "../../auth/session.js";
import { jsonResponse } from "../response.js";
import { createAuthRoutes } from "./auth.routes.js";
import { createCollectionsRoutes } from "./collections.routes.js";
import { createDashboardRoutes } from "./dashboard.routes.js";
import { createImportsRoutes } from "./imports.routes.js";
import { createLanguagesRoutes } from "./languages.routes.js";
import { createMaterialsRoutes } from "./materials.routes.js";
import { createPracticeRoutes } from "./practice.routes.js";
import { createSettingsRoutes } from "./settings.routes.js";
import { createWordsRoutes } from "./words.routes.js";

const UNSAFE_METHODS = new Set(["POST", "PATCH", "DELETE"]);

/**
 * Creates the single async request handler that dispatches all `/api/*` requests.
 *
 * @param {Object} deps - Application-level dependencies.
 * @param {import("../../db/repositories.js").Repositories} deps.repositories - Repository bundle
 *   providing data-access methods for every domain.
 * @param {import("../../shared/email.js").EmailService} deps.emailService - Email delivery service
 *   used by auth routes for verification and password-reset emails.
 * @returns {(req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse, url: URL) => Promise<void>}
 *   Async handler. Writes the complete response (including 403 CSRF errors,
 *   401 authentication failures, domain-specific responses, and a 404 fallback).
 */
export function createApiHandler({ repositories, emailService }) {
  const session = createSessionHelpers(repositories.auth);
  const publicRoutes = [createAuthRoutes({ repositories, emailService, ...session })];
  const authenticatedRoutes = [
    createDashboardRoutes({ repositories }),
    createLanguagesRoutes({ repositories }),
    createMaterialsRoutes({ repositories }),
    createPracticeRoutes({ repositories }),
    createSettingsRoutes({ repositories, session }),
    createWordsRoutes({ repositories }),
    createCollectionsRoutes({ repositories }),
    createImportsRoutes({ repositories })
  ];

  return async function handleApi(req, res, url) {
    if (UNSAFE_METHODS.has(req.method) && !session.verifyCsrfTokenForRequest(req)) {
      jsonResponse(res, 403, {
        error: "Security token is missing or expired. Please refresh the page and try again.",
        errorKey: "errors.csrfInvalid"
      });
      return;
    }

    for (const route of publicRoutes) {
      if (await route(req, res, url)) {
        return;
      }
    }

    const user = await session.requireUser(req, res);
    if (!user) {
      return;
    }

    for (const route of authenticatedRoutes) {
      if (await route(req, res, url, user)) {
        return;
      }
    }

    return jsonResponse(res, 404, { error: "Not found." });
  };
}

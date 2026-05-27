import { createSessionHelpers } from "../../auth/session.js";
import { jsonResponse } from "../response.js";
import { createAuthRoutes } from "./auth.routes.js";
import { createCollectionsRoutes } from "./collections.routes.js";
import { createDashboardRoutes } from "./dashboard.routes.js";
import { createImportsRoutes } from "./imports.routes.js";
import { createLanguagesRoutes } from "./languages.routes.js";
import { createMaterialsRoutes } from "./materials.routes.js";
import { createSettingsRoutes } from "./settings.routes.js";
import { createWordsRoutes } from "./words.routes.js";

export function createApiHandler({ repositories }) {
  const session = createSessionHelpers(repositories.auth);
  const publicRoutes = [createAuthRoutes({ repositories, ...session })];
  const authenticatedRoutes = [
    createDashboardRoutes({ repositories }),
    createLanguagesRoutes({ repositories }),
    createMaterialsRoutes({ repositories }),
    createSettingsRoutes({ repositories }),
    createWordsRoutes({ repositories }),
    createCollectionsRoutes({ repositories }),
    createImportsRoutes({ repositories })
  ];

  return async function handleApi(req, res, url) {
    for (const route of publicRoutes) {
      if (await route(req, res, url)) {
        return;
      }
    }

    const user = session.requireUser(req, res);
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

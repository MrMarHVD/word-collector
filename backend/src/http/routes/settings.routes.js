import { NATIVE_LANGUAGE_OPTIONS } from "../../config.js";
import { readJson } from "../request.js";
import { jsonResponse } from "../response.js";

export function createSettingsRoutes({ repositories }) {
  return async function handleSettingsRoutes(req, res, url, user) {
    if (req.method !== "PATCH" || url.pathname !== "/api/settings") {
      return false;
    }

    const body = await readJson(req);
    const nativeLanguage = String(body.nativeLanguage || "");
    if (!NATIVE_LANGUAGE_OPTIONS.includes(nativeLanguage)) {
      jsonResponse(res, 400, { error: "Unsupported native language." });
      return true;
    }
    repositories.auth.updateNativeLanguage(nativeLanguage, user.userId);
    jsonResponse(res, 200, {
      user: {
        id: user.userId,
        email: user.email,
        nativeLanguage
      },
      nativeLanguageOptions: NATIVE_LANGUAGE_OPTIONS
    });
    return true;
  };
}

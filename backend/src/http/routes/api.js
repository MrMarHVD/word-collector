import { clearAuthCookie, createSessionHelpers } from "../../auth/session.js";
import { NATIVE_LANGUAGE_OPTIONS, STUDY_LANGUAGE_OPTIONS } from "../../config.js";
import { jsonResponse } from "../response.js";
import { readJson, readMultipart } from "../request.js";
import { getAuthContext, loginUser, registerUser } from "../../modules/auth/auth.service.js";
import { getDashboard } from "../../modules/dashboard/dashboard.service.js";
import { getLanguage, getLanguages } from "../../modules/languages/languages.service.js";
import { getWords } from "../../modules/words/words.service.js";
import { importWords } from "../../modules/imports/imports.service.js";
import { getMaterialReader, getMaterials, importMaterial, updateMaterialReaderStart } from "../../modules/materials/materials.service.js";

// Create the HTTP API router with database dependencies supplied by server.js.
export function createApiHandler({ repositories }) {
  const { getAuthenticatedUser, requireUser, setJwtForUser } = createSessionHelpers(repositories.auth);

  // Dependency injection keeps startup wiring separate from route behavior.
  return async function handleApi(req, res, url) {
    if (req.method === "GET" && url.pathname === "/api/auth/me") {
      const user = getAuthenticatedUser(req);
      if (!user) {
        return jsonResponse(res, 200, {
          user: null,
          languages: [],
          predefinedLanguages: repositories.languages.listPredefined(),
          studyLanguageOptions: STUDY_LANGUAGE_OPTIONS,
          nativeLanguageOptions: NATIVE_LANGUAGE_OPTIONS
        });
      }
      const context = getAuthContext(repositories, user.userId);
      return jsonResponse(res, 200, {
        ...context,
        studyLanguageOptions: STUDY_LANGUAGE_OPTIONS,
        nativeLanguageOptions: NATIVE_LANGUAGE_OPTIONS
      });
    }

    if (req.method === "POST" && url.pathname === "/api/auth/login") {
      const body = await readJson(req);
      const result = loginUser(repositories, body.email, body.password);
      if (result.error) {
        return jsonResponse(res, result.status, { error: result.error });
      }
      setJwtForUser(res, result.user);
      return jsonResponse(res, 200, { user: { id: result.user.id, email: result.user.email, nativeLanguage: result.user.nativeLanguage } });
    }

    if (req.method === "POST" && url.pathname === "/api/auth/register") {
      const body = await readJson(req);
      const result = registerUser(repositories, body.email, body.password, body.confirmPassword);
      if (result.error) {
        return jsonResponse(res, result.status, { error: result.error });
      }
      setJwtForUser(res, result.user);
      return jsonResponse(res, 201, { user: { id: result.user.id, email: result.user.email, nativeLanguage: result.user.nativeLanguage } });
    }

    if (req.method === "POST" && url.pathname === "/api/auth/logout") {
      clearAuthCookie(res);
      return jsonResponse(res, 200, { loggedOut: true });
    }

    const user = requireUser(req, res);
    if (!user) {
      return;
    }

    // Everything below requires a valid session and filters data by user.
    if (req.method === "GET" && url.pathname === "/api/dashboard") {
      return jsonResponse(res, 200, getDashboard(repositories, user.userId, url.searchParams.get("languageId")));
    }

    if (req.method === "GET" && url.pathname === "/api/languages") {
      return jsonResponse(res, 200, { languages: getLanguages(repositories, user.userId), predefinedLanguages: repositories.languages.listPredefined(), studyLanguageOptions: STUDY_LANGUAGE_OPTIONS });
    }

    if (req.method === "GET" && url.pathname === "/api/materials") {
      const languageId = Number(url.searchParams.get("languageId"));
      if (!repositories.languages.findById(languageId, user.userId)) {
        return jsonResponse(res, 404, { error: "Language not found." });
      }
      return jsonResponse(res, 200, {
        materials: getMaterials(repositories, user.userId, languageId, url.searchParams.get("offset")),
        pageSize: 50
      });
    }

    if (req.method === "POST" && url.pathname === "/api/materials") {
      const { fields, files } = await readMultipart(req);
      const result = await importMaterial(repositories, user.userId, fields.languageId, files.file);
      if (result.error) {
        return jsonResponse(res, 400, result);
      }
      return jsonResponse(res, 201, result);
    }

    const materialMatch = url.pathname.match(/^\/api\/materials\/(\d+)$/);
    if (req.method === "GET" && materialMatch) {
      const reader = getMaterialReader(repositories, user.userId, Number(materialMatch[1]), url.searchParams.has("start") ? url.searchParams.get("start") : null, url.searchParams.get("limit"));
      if (!reader) {
        return jsonResponse(res, 404, { error: "Material not found." });
      }
      return jsonResponse(res, 200, reader);
    }

    if (req.method === "PATCH" && materialMatch) {
      const body = await readJson(req);
      const material = updateMaterialReaderStart(repositories, user.userId, Number(materialMatch[1]), body.readerStart);
      if (!material) {
        return jsonResponse(res, 404, { error: "Material not found." });
      }
      return jsonResponse(res, 200, { material });
    }

    if (req.method === "DELETE" && materialMatch) {
      const materialId = Number(materialMatch[1]);
      if (!repositories.materials.findById(materialId, user.userId)) {
        return jsonResponse(res, 404, { error: "Material not found." });
      }
      const result = repositories.materials.deleteById(materialId, user.userId);
      if (!result.changes) {
        return jsonResponse(res, 404, { error: "Material not found." });
      }
      return jsonResponse(res, 200, { deleted: true, id: materialId });
    }

    if (req.method === "PATCH" && url.pathname === "/api/settings") {
      const body = await readJson(req);
      const nativeLanguage = String(body.nativeLanguage || "");
      if (!NATIVE_LANGUAGE_OPTIONS.includes(nativeLanguage)) {
        return jsonResponse(res, 400, { error: "Unsupported native language." });
      }
      repositories.auth.updateNativeLanguage(nativeLanguage, user.userId);
      return jsonResponse(res, 200, {
        user: {
          id: user.userId,
          email: user.email,
          nativeLanguage
        },
        nativeLanguageOptions: NATIVE_LANGUAGE_OPTIONS
      });
    }

    const wordsMatch = url.pathname.match(/^\/api\/collections\/(\d+)\/words$/);
    if (req.method === "GET" && wordsMatch) {
      const collectionId = Number(wordsMatch[1]);
      const collection = repositories.words.findCollectionById(collectionId, user.userId);
      if (!collection) {
        return jsonResponse(res, 404, { error: "Collection not found." });
      }
      const nativeLanguage = repositories.auth.findUserById(user.userId)?.nativeLanguage || "English";
      return jsonResponse(res, 200, {
        collection,
        words: getWords(repositories, user.userId, collectionId, url.searchParams.get("search") || "", nativeLanguage)
      });
    }

    const collectionMatch = url.pathname.match(/^\/api\/collections\/(\d+)$/);
    if (req.method === "PATCH" && collectionMatch) {
      const collectionId = Number(collectionMatch[1]);
      const body = await readJson(req);
      const language = getLanguage(repositories, user.userId, body.languageId);
      if (!language) {
        return jsonResponse(res, 400, { error: "Language is required." });
      }
      const collection = repositories.words.findCollectionById(collectionId, user.userId);
      if (!collection) {
        return jsonResponse(res, 404, { error: "Collection not found." });
      }
      try {
        repositories.words.updateCollectionLanguage(language.id, collectionId);
      } catch (error) {
        return jsonResponse(res, 409, { error: "A collection with this name already exists in that language." });
      }
      return jsonResponse(res, 200, repositories.words.findCollectionById(collectionId, user.userId));
    }

    if (req.method === "DELETE" && collectionMatch) {
      const collectionId = Number(collectionMatch[1]);
      if (!repositories.words.findCollectionById(collectionId, user.userId)) {
        return jsonResponse(res, 404, { error: "Collection not found." });
      }
      const result = repositories.words.deleteCollection(collectionId);
      if (!result.changes) {
        return jsonResponse(res, 404, { error: "Collection not found." });
      }
      return jsonResponse(res, 200, { deleted: true, id: collectionId });
    }

    if (req.method === "POST" && url.pathname === "/api/import") {
      const body = await readJson(req);
      const result = importWords(repositories, user.userId, body.collectionName, body.languageId, body.words);
      if (result.error) {
        return jsonResponse(res, 400, result);
      }
      return jsonResponse(res, 201, result);
    }

    const knownMatch = url.pathname.match(/^\/api\/words\/(\d+)$/);
    if (req.method === "PATCH" && knownMatch) {
      const id = Number(knownMatch[1]);
      const body = await readJson(req);
      const known = body.known ? 1 : 0;
      const existingWord = repositories.words.findWordById(user.userId, id);
      if (!existingWord) {
        return jsonResponse(res, 404, { error: "Word not found." });
      }
      repositories.words.upsertKnown(user.userId, id, known);
      return jsonResponse(res, 200, repositories.words.findWordById(user.userId, id));
    }

    return jsonResponse(res, 404, { error: "Not found." });
  };
}

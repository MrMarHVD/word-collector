import { clearAuthCookie, createSessionHelpers } from "../auth/session.js";
import { NATIVE_LANGUAGE_OPTIONS, STUDY_LANGUAGE_OPTIONS } from "../config.js";
import { hashPassword, verifyPassword } from "../auth/password.js";
import { jsonResponse } from "../http/response.js";
import { readJson, readMultipart } from "../http/request.js";
import { normalizeName } from "../shared/normalize.js";
import { getDashboard } from "../services/dashboard.js";
import { ensureStudyLanguagesForUser, getLanguage, getLanguages } from "../services/languages.js";
import { getWords } from "../services/words.js";
import { importWords } from "../services/importWords.js";
import { getMaterialReader, getMaterials, importMaterial, updateMaterialReaderStart } from "../services/materials.js";

// Create the HTTP API router with database dependencies supplied by server.js.
export function createApiHandler({ db, statements }) {
  const { getAuthenticatedUser, requireUser, setJwtForUser } = createSessionHelpers(statements);

  // Dependency injection keeps startup wiring separate from route behavior.
  return async function handleApi(req, res, url) {
    if (req.method === "GET" && url.pathname === "/api/auth/me") {
      const user = getAuthenticatedUser(req);
      if (!user) {
        return jsonResponse(res, 200, {
          user: null,
          languages: [],
          predefinedLanguages: statements.predefinedLanguages.all(),
          studyLanguageOptions: STUDY_LANGUAGE_OPTIONS,
          nativeLanguageOptions: NATIVE_LANGUAGE_OPTIONS
        });
      }
      const languages = getLanguages(db, user.userId);
      const profile = statements.userById.get(user.userId);
      return jsonResponse(res, 200, {
        user: { id: user.userId, email: user.email, nativeLanguage: profile.nativeLanguage },
        languages,
        predefinedLanguages: statements.predefinedLanguages.all(),
        studyLanguageOptions: STUDY_LANGUAGE_OPTIONS,
        nativeLanguageOptions: NATIVE_LANGUAGE_OPTIONS,
        needsOnboarding: languages.length === 0
      });
    }

    if (req.method === "POST" && url.pathname === "/api/auth/login") {
      const body = await readJson(req);
      const email = normalizeName(body.email).toLowerCase();
      const user = statements.userByEmail.get(email);
      if (!user || !verifyPassword(String(body.password || ""), user.passwordSalt, user.passwordHash)) {
        return jsonResponse(res, 401, { error: "Invalid email or password." });
      }
      setJwtForUser(res, user);
      return jsonResponse(res, 200, { user: { id: user.id, email: user.email, nativeLanguage: user.nativeLanguage } });
    }

    if (req.method === "POST" && url.pathname === "/api/auth/register") {
      const body = await readJson(req);
      const email = normalizeName(body.email).toLowerCase();
      const password = String(body.password || "");
      const confirmPassword = String(body.confirmPassword || "");
      if (!email || !password || password !== confirmPassword) {
        return jsonResponse(res, 400, { error: "Email, password, and matching confirmation are required." });
      }
      if (statements.userByEmail.get(email)) {
        return jsonResponse(res, 409, { error: "User already exists." });
      }
      const passwordHash = hashPassword(password);
      statements.createUser.run(email, passwordHash.hash, passwordHash.salt);
      const user = statements.userByEmail.get(email);
      ensureStudyLanguagesForUser(statements, user.id);
      setJwtForUser(res, user);
      return jsonResponse(res, 201, { user: { id: user.id, email: user.email, nativeLanguage: user.nativeLanguage } });
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
      return jsonResponse(res, 200, getDashboard(db, statements, user.userId, url.searchParams.get("languageId")));
    }

    if (req.method === "GET" && url.pathname === "/api/languages") {
      return jsonResponse(res, 200, { languages: getLanguages(db, user.userId), predefinedLanguages: statements.predefinedLanguages.all(), studyLanguageOptions: STUDY_LANGUAGE_OPTIONS });
    }

    if (req.method === "GET" && url.pathname === "/api/materials") {
      const languageId = Number(url.searchParams.get("languageId"));
      if (!statements.languageById.get(languageId, user.userId)) {
        return jsonResponse(res, 404, { error: "Language not found." });
      }
      return jsonResponse(res, 200, {
        materials: getMaterials(db, statements, user.userId, languageId, url.searchParams.get("offset")),
        pageSize: 50
      });
    }

    if (req.method === "POST" && url.pathname === "/api/materials") {
      const { fields, files } = await readMultipart(req);
      const result = await importMaterial(db, statements, user.userId, fields.languageId, files.file);
      if (result.error) {
        return jsonResponse(res, 400, result);
      }
      return jsonResponse(res, 201, result);
    }

    const materialMatch = url.pathname.match(/^\/api\/materials\/(\d+)$/);
    if (req.method === "GET" && materialMatch) {
      const reader = getMaterialReader(db, statements, user.userId, Number(materialMatch[1]), url.searchParams.has("start") ? url.searchParams.get("start") : null, url.searchParams.get("limit"));
      if (!reader) {
        return jsonResponse(res, 404, { error: "Material not found." });
      }
      return jsonResponse(res, 200, reader);
    }

    if (req.method === "PATCH" && materialMatch) {
      const body = await readJson(req);
      const material = updateMaterialReaderStart(statements, user.userId, Number(materialMatch[1]), body.readerStart);
      if (!material) {
        return jsonResponse(res, 404, { error: "Material not found." });
      }
      return jsonResponse(res, 200, { material });
    }

    if (req.method === "DELETE" && materialMatch) {
      const materialId = Number(materialMatch[1]);
      if (!statements.materialById.get(materialId, user.userId)) {
        return jsonResponse(res, 404, { error: "Material not found." });
      }
      const result = statements.deleteMaterial.run(materialId, user.userId);
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
      statements.updateNativeLanguage.run(nativeLanguage, user.userId);
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
      const collection = statements.collectionById.get(collectionId, user.userId);
      if (!collection) {
        return jsonResponse(res, 404, { error: "Collection not found." });
      }
      const nativeLanguage = statements.userById.get(user.userId)?.nativeLanguage || "English";
      return jsonResponse(res, 200, {
        collection,
        words: getWords(db, user.userId, collectionId, url.searchParams.get("search") || "", nativeLanguage)
      });
    }

    const collectionMatch = url.pathname.match(/^\/api\/collections\/(\d+)$/);
    if (req.method === "PATCH" && collectionMatch) {
      const collectionId = Number(collectionMatch[1]);
      const body = await readJson(req);
      const language = getLanguage(statements, user.userId, body.languageId);
      if (!language) {
        return jsonResponse(res, 400, { error: "Language is required." });
      }
      const collection = statements.collectionById.get(collectionId, user.userId);
      if (!collection) {
        return jsonResponse(res, 404, { error: "Collection not found." });
      }
      try {
        statements.updateCollectionLanguage.run(language.id, collectionId);
      } catch (error) {
        return jsonResponse(res, 409, { error: "A collection with this name already exists in that language." });
      }
      return jsonResponse(res, 200, statements.collectionById.get(collectionId, user.userId));
    }

    if (req.method === "DELETE" && collectionMatch) {
      const collectionId = Number(collectionMatch[1]);
      if (!statements.collectionById.get(collectionId, user.userId)) {
        return jsonResponse(res, 404, { error: "Collection not found." });
      }
      const result = statements.deleteCollection.run(collectionId);
      if (!result.changes) {
        return jsonResponse(res, 404, { error: "Collection not found." });
      }
      return jsonResponse(res, 200, { deleted: true, id: collectionId });
    }

    if (req.method === "POST" && url.pathname === "/api/import") {
      const body = await readJson(req);
      const result = importWords(db, statements, user.userId, body.collectionName, body.languageId, body.words);
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
      const existingWord = statements.wordById.get(user.userId, id, user.userId);
      if (!existingWord) {
        return jsonResponse(res, 404, { error: "Word not found." });
      }
      statements.upsertKnown.run(user.userId, id, known);
      return jsonResponse(res, 200, statements.wordById.get(user.userId, id, user.userId));
    }

    return jsonResponse(res, 404, { error: "Not found." });
  };
}

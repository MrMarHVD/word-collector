/**
 * Typed client for every /api endpoint. Import the namespaced object
 * (`api.words.setStatus(...)`) or the helpers below; build feature-specific
 * TanStack Query hooks from these functions inside the feature folder.
 */

import * as admin from "./admin";
import * as auth from "./auth";
import * as categories from "./categories";
import * as collections from "./collections";
import * as dashboard from "./dashboard";
import * as imports from "./imports";
import * as languages from "./languages";
import * as materials from "./materials";
import * as practice from "./practice";
import * as settings from "./settings";
import * as words from "./words";

export const api = { admin, auth, categories, collections, dashboard, imports, languages, materials, practice, settings, words };

export { ApiError, apiErrorMessage, apiUrl, csrfHeaders, errorMessage, getCsrfToken, request, setCsrfToken, setUnauthorizedHandler } from "./client";
export type { ApiErrorPayload, QueryValue, RequestOptions } from "./client";
export { dashboardSummaryQuery, refreshStudyData } from "./queries";
export { queryKeys } from "./query-keys";
export type * from "./types";

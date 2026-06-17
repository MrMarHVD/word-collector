/**
 * @fileoverview Central mutable state store for the Word Marker SPA.
 *
 * Exports a single `state` object that is imported and mutated directly by view
 * and controller modules. Persisted preferences (theme, locale, display mode, etc.)
 * are read from `localStorage` once at module evaluation time; all other fields
 * start at safe defaults.
 *
 * Also exports module-level constants that cap paginated data sets and enforce
 * beta-tier resource limits.
 */

/** Maximum number of words fetched in a single vocabulary-list request. */
export const WORD_PAGE_SIZE = 50;
/** Number of words shown per page in the reader's paginated word list. */
export const WORDS_PER_PAGE = 10;
/** Beta cap on the total number of materials a single user may have. */
export const BETA_MAX_MATERIALS_PER_USER = 10;
/** Beta cap on the file size (bytes) of a single material upload (50 MB). */
export const BETA_MAX_MATERIAL_UPLOAD_BYTES = 50 * 1024 * 1024;

/**
 * Normalise a persisted word-list display mode value.
 *
 * @param {string|null} stored - Value read from `localStorage`.
 * @returns {"page"|"infinite"} `"page"` if stored, otherwise `"infinite"`.
 */
function normalizeDisplayMode(stored) {
  return stored === "page" ? "page" : "infinite";
}

/**
 * Normalise a persisted reader words-per-page value.
 *
 * @param {string|null} stored - Value read from `localStorage`.
 * @returns {"fit"|number} `"fit"` if stored, a parsed integer, or `250` as the default.
 */
function normalizeReaderWordsPerPage(stored) {
  if (stored === "fit") {
    return "fit";
  }
  return Number(stored) || 250;
}

/**
 * Normalise a persisted dashboard stats tab identifier.
 *
 * @param {string|null} stored - Value read from `localStorage`.
 * @returns {"documents"|"overview"} `"documents"` if stored, otherwise `"overview"`.
 */
function normalizeDashboardStatsTab(stored) {
  return stored === "documents" ? "documents" : "overview";
}

/**
 * Mutable browser-side application state. Persisted preferences are read from
 * `localStorage` once at module load time; all other fields default to `null`,
 * `[]`, `""`, or `false`.
 *
 * @type {{
 *   csrfToken: string|null,
 *   user: object|null,
 *   languages: Array<{id: number, name: string}>,
 *   predefinedLanguages: string[],
 *   studyLanguageOptions: string[],
 *   nativeLanguageOptions: string[],
 *   authProviders: Record<string, unknown>,
 *   authMode: "login"|"register",
 *   resetToken: string|null,
 *   dashboard: object|null,
 *   dashboardStatsTab: "overview"|"documents",
 *   dashboardDocuments: object[],
 *   dashboardDocumentSearch: string,
 *   dashboardDocumentOffset: number,
 *   dashboardDocumentHasMore: boolean,
 *   dashboardDocumentLoading: boolean,
 *   selectedStudyLanguageId: number|null,
 *   selectedStudyLanguageName: string,
 *   selectedCollectionId: "all"|number,
 *   selectedMaterialId: number|null,
 *   materials: object[],
 *   materialSearch: string,
 *   materialRenameId: number|null,
 *   importInProgress: boolean,
 *   importingMaterialId: number|null,
 *   materialOffset: number,
 *   materialHasMore: boolean,
 *   readerTokens: object[],
 *   readerFetchedTokens: object[],
 *   readerStart: number,
 *   readerWordsPerPage: "fit"|number,
 *   readerFontSize: number,
 *   readerSidebarCollapsed: boolean,
 *   readerSidebarWidth: number,
 *   readerInfoWidth: number,
 *   readerPanelWidth: number,
 *   readerPanelHeight: number,
 *   readerFocusMode: boolean,
 *   readerFocusPanelWidth: number,
 *   readerSidebarTab: "read"|"documents"|"settings",
 *   collectionsSidebarCollapsed: boolean,
 *   settingsTab: string,
 *   readerAutoMarkKnownOnPageTurn: boolean,
 *   readerAutoMarkLearningOnClick: boolean,
 *   readerShowWordSpaces: boolean,
 *   readerHighlightOpacity: number,
 *   words: object[],
 *   selectedWordIds: Set<number>,
 *   expandedDisambiguationWordId: number|null,
 *   translationOverrideEditWordId: number|null,
 *   translationOverrideEditContext: string|null,
 *   readerWordInfoTokenId: number|null,
 *   selectionAnchorId: number|null,
 *   visibleWordCount: number,
 *   wordsPage: number,
 *   wordDisplayMode: "page"|"infinite",
 *   search: string,
 *   activeTab: string,
 *   theme: "system"|"light"|"dark",
 *   locale: string,
 *   messages: Record<string, Record<string, string>>
 * }}
 */
// Mutable browser state. Persisted preferences are read once during startup.
export const state = {
  csrfToken: null,
  user: null,
  languages: [],
  predefinedLanguages: [],
  studyLanguageOptions: [],
  nativeLanguageOptions: [],
  authProviders: {},
  authMode: "login",
  resetToken: null,
  dashboard: null,
  dashboardStatsTab: normalizeDashboardStatsTab(localStorage.getItem("wordMarkerDashboardStatsTab")),
  dashboardDocuments: [],
  dashboardDocumentSearch: "",
  dashboardDocumentOffset: 0,
  dashboardDocumentHasMore: true,
  dashboardDocumentLoading: false,
  selectedStudyLanguageId: null,
  selectedStudyLanguageName: localStorage.getItem("wordMarkerStudyLanguageName") || "",
  selectedCollectionId: "all",
  selectedMaterialId: null,
  materials: [],
  materialSearch: "",
  materialRenameId: null,
  importInProgress: false,
  importingMaterialId: null,
  materialOffset: 0,
  materialHasMore: true,
  readerTokens: [],
  readerFetchedTokens: [],
  readerStart: 0,
  readerWordsPerPage: normalizeReaderWordsPerPage(localStorage.getItem("wordMarkerReaderWordsPerPage")),
  readerFontSize: Number(localStorage.getItem("wordMarkerReaderFontSize")) || 22,
  readerSidebarCollapsed: localStorage.getItem("wordMarkerReaderSidebarCollapsed") === "true",
  readerSidebarWidth: Number(localStorage.getItem("wordMarkerReaderSidebarWidth")) || 300,
  readerInfoWidth: Number(localStorage.getItem("wordMarkerReaderInfoWidth")) || 300,
  readerPanelWidth: Number(localStorage.getItem("wordMarkerReaderPanelWidth")) || 0,
  readerPanelHeight: Number(localStorage.getItem("wordMarkerReaderPanelHeight")) || 0,
  readerFocusMode: localStorage.getItem("wordMarkerReaderFocusMode") === "true",
  readerFocusPanelWidth: Number(localStorage.getItem("wordMarkerReaderFocusPanelWidth")) || 0,
  readerSidebarTab: "read",
  collectionsSidebarCollapsed: localStorage.getItem("wordMarkerCollectionsSidebarCollapsed") === "true",
  settingsTab: "system",
  readerAutoMarkKnownOnPageTurn: localStorage.getItem("wordMarkerReaderAutoMarkKnownOnPageTurn") === "true",
  readerAutoMarkLearningOnClick: localStorage.getItem("wordMarkerReaderAutoMarkLearningOnClick") !== "false",
  readerShowWordSpaces: localStorage.getItem("wordMarkerReaderShowWordSpaces") === "true",
  readerHighlightOpacity: Number(localStorage.getItem("wordMarkerReaderHighlightOpacity")) || 0.2,
  words: [],
  selectedWordIds: new Set(),
  expandedDisambiguationWordId: null,
  translationOverrideEditWordId: null,
  translationOverrideEditContext: null,
  readerWordInfoTokenId: null,
  selectionAnchorId: null,
  visibleWordCount: WORD_PAGE_SIZE,
  wordsPage: 0,
  wordDisplayMode: normalizeDisplayMode(localStorage.getItem("wordMarkerDisplayMode")),
  search: "",
  activeTab: localStorage.getItem("wordMarkerActiveTab") || "dashboard",
  theme: localStorage.getItem("wordMarkerTheme") || "system",
  locale: localStorage.getItem("wordMarkerLocale") || "en",
  messages: {}
};

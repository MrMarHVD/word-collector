export const WORD_PAGE_SIZE = 50;
export const WORDS_PER_PAGE = 10;
export const BETA_MAX_MATERIALS_PER_USER = 10;
export const BETA_MAX_MATERIAL_UPLOAD_BYTES = 50 * 1024 * 1024;

function normalizeDisplayMode(stored) {
  return stored === "infinite" ? "infinite" : "page";
}

function normalizeReaderWordsPerPage(stored) {
  if (stored === "fit") {
    return "fit";
  }
  return Number(stored) || 250;
}

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
  readerSidebarTab: "import",
  settingsTab: "system",
  readerAutoMarkKnownOnPageTurn: localStorage.getItem("wordMarkerReaderAutoMarkKnownOnPageTurn") === "true",
  readerAutoMarkLearningOnClick: localStorage.getItem("wordMarkerReaderAutoMarkLearningOnClick") !== "false",
  readerShowWordSpaces: localStorage.getItem("wordMarkerReaderShowWordSpaces") === "true",
  readerHighlightOpacity: Number(localStorage.getItem("wordMarkerReaderHighlightOpacity")) || 0.2,
  words: [],
  selectedWordIds: new Set(),
  expandedDisambiguationWordId: null,
  selectionAnchorId: null,
  visibleWordCount: WORD_PAGE_SIZE,
  wordsPage: 0,
  wordDisplayMode: normalizeDisplayMode(localStorage.getItem("wordMarkerDisplayMode")),
  search: "",
  activeTab: localStorage.getItem("wordMarkerActiveTab") || "dashboard",
  theme: localStorage.getItem("wordMarkerTheme") || "system",
  locale: localStorage.getItem("wordMarkerLocale") || "ja",
  messages: {}
};

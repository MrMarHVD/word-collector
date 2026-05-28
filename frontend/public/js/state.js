export const WORD_PAGE_SIZE = 50;
export const WORDS_PER_PAGE = 10;

function normalizeDisplayMode(stored) {
  return stored === "infinite" ? "infinite" : "page";
}

// Mutable browser state. Persisted preferences are read once during startup.
export const state = {
  user: null,
  languages: [],
  predefinedLanguages: [],
  studyLanguageOptions: [],
  nativeLanguageOptions: [],
  authMode: "login",
  dashboard: null,
  selectedStudyLanguageId: null,
  selectedStudyLanguageName: localStorage.getItem("wordMarkerStudyLanguageName") || "",
  selectedCollectionId: "all",
  selectedMaterialId: null,
  materials: [],
  materialOffset: 0,
  materialHasMore: true,
  readerTokens: [],
  readerStart: 0,
  readerWordsPerPage: Number(localStorage.getItem("wordMarkerReaderWordsPerPage")) || 250,
  readerFontSize: Number(localStorage.getItem("wordMarkerReaderFontSize")) || 22,
  readerSidebarCollapsed: localStorage.getItem("wordMarkerReaderSidebarCollapsed") === "true",
  readerSidebarWidth: Number(localStorage.getItem("wordMarkerReaderSidebarWidth")) || 300,
  readerInfoWidth: Number(localStorage.getItem("wordMarkerReaderInfoWidth")) || 300,
  readerPanelWidth: Number(localStorage.getItem("wordMarkerReaderPanelWidth")) || 0,
  readerPanelHeight: Number(localStorage.getItem("wordMarkerReaderPanelHeight")) || 0,
  readerSidebarTab: "import",
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

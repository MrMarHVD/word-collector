export const WORD_PAGE_SIZE = 50;

export const state = {
  user: null,
  predefinedLanguages: [],
  nativeLanguageOptions: [],
  authMode: "login",
  dashboard: null,
  selectedDashboardLanguageId: null,
  selectedReaderLanguageId: Number(localStorage.getItem("wordMarkerReaderLanguageId")) || null,
  selectedCollectionId: null,
  selectedMaterialId: null,
  materials: [],
  materialOffset: 0,
  materialHasMore: true,
  readerTokens: [],
  readerStart: 0,
  readerWordsPerPage: Number(localStorage.getItem("wordMarkerReaderWordsPerPage")) || 250,
  readerFontSize: Number(localStorage.getItem("wordMarkerReaderFontSize")) || 22,
  readerSidebarCollapsed: localStorage.getItem("wordMarkerReaderSidebarCollapsed") === "true",
  words: [],
  visibleWordCount: WORD_PAGE_SIZE,
  wordDisplayMode: localStorage.getItem("wordMarkerDisplayMode") || "infinite",
  search: "",
  activeTab: localStorage.getItem("wordMarkerActiveTab") || "dashboard",
  locale: localStorage.getItem("wordMarkerLocale") || "ja",
  messages: {}
};

export const WORD_PAGE_SIZE = 50;

export const state = {
  user: null,
  predefinedLanguages: [],
  nativeLanguageOptions: [],
  authMode: "login",
  dashboard: null,
  selectedDashboardLanguageId: null,
  selectedCollectionId: null,
  words: [],
  visibleWordCount: WORD_PAGE_SIZE,
  wordDisplayMode: localStorage.getItem("wordMarkerDisplayMode") || "infinite",
  search: "",
  activeTab: localStorage.getItem("wordMarkerActiveTab") || "dashboard",
  locale: localStorage.getItem("wordMarkerLocale") || "ja",
  messages: {}
};

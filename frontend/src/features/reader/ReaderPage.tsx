import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { SidebarLayout, SidebarOpenButton } from "@/components/app/Sidebar";
import { toastError } from "@/components/app/toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { refreshStudyData } from "@/lib/api/queries";
import type { MaterialListItem, ReaderToken, WordStatus } from "@/lib/api/types";
import { useAnimatedSidebar } from "@/lib/hooks/use-animated-sidebar";
import { useIsMobileLayout } from "@/lib/hooks/use-media-query";
import { useFormatCount, useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useReaderPreferencesStore, type ReaderWordsPerPage } from "@/stores/reader-preferences";
import { useSessionStore } from "@/stores/session";
import { useStudyLanguageStore } from "@/stores/study-language";
import { QUICK_MENU_ACTIONS, type QuickMenuActionKey } from "./quick-menu";
import { attachReaderGestures, SEGMENT_SELECTED_EVENT, type ReaderGestures, type SegmentRange, type SegmentSelectedDetail } from "./reader-gestures";
import { measureFitTokenCount } from "./reader-fit";
import { computeReaderLayout, readerSidebarColumnWidth } from "./reader-layout";
import { pageTurnStart, readerPageStatus, type PageDirection } from "./reader-pagination";
import { readerSession, type ReaderSidebarTab } from "./reader-session";
import { isWordSpacingLanguage, layoutReaderTokens, normalizeStatus, type ReaderLayout } from "./reader-tokens";
import { ReaderQuickMenu, type ReaderQuickMenuState } from "./ReaderQuickMenu";
import { ReaderSidebar, ReaderSidebarTabList } from "./ReaderSidebar";
import { ReaderTokens } from "./ReaderTokens";
import { ReaderTranslationPopup, type ReaderTranslationState } from "./ReaderTranslationPopup";
import { ReaderWordInfo } from "./ReaderWordInfo";
import { isSegmentTranslationEligible } from "./segment-text";
import { translate, TranslationError } from "./translation/translation.service";
import { useReaderMaterial } from "./use-reader-material";
import "./reader.css";

const WORDS_PER_PAGE_OPTIONS = ["fit", "100", "250", "500", "1000"] as const;
const NO_TOKENS: ReaderToken[] = [];
const PAGE_BUTTON = "secondary-button min-h-10 rounded-md border border-line bg-panel px-4 text-sm font-bold text-brand hover:bg-hover";
const FOCUS_BUTTON = "secondary-button border border-line bg-panel text-brand shadow-panel hover:bg-hover";

/** Word-info target: the tapped token, with a snapshot kept for when the page no longer holds it. */
interface WordInfoTarget {
  tokenId: number;
  wordId: number;
  snapshot: ReaderToken;
}

function isTextInputTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

/** The reader route (/reader). Keyed on the study language, so a switch starts from that language's saved material. */
export default function ReaderPage() {
  const languageId = useStudyLanguageStore((state) => state.selectedId);
  return <ReaderScreen key={languageId ?? "none"} languageId={languageId} />;
}

/**
 * The reader (ported from views/reader.js and reader.controller.js): the
 * sidebar with documents and settings, and the reading panel with token
 * pages, pagination, focus mode, word-info, the radial quick
 * menu and sentence translation.
 */
function ReaderScreen({ languageId }: { languageId: number | null }) {
  const t = useT();
  const formatCount = useFormatCount();
  const queryClient = useQueryClient();
  const user = useSessionStore((state) => state.user);
  const studyLanguageName = useStudyLanguageStore((state) => state.selectedName);
  const isMobile = useIsMobileLayout();
  const wordsPerPage = useReaderPreferencesStore((state) => state.wordsPerPage);
  const fontSize = useReaderPreferencesStore((state) => state.fontSize);
  const focusMode = useReaderPreferencesStore((state) => state.focusMode);
  const sidebarCollapsed = useReaderPreferencesStore((state) => state.sidebarCollapsed);
  const panelWidth = useReaderPreferencesStore((state) => state.panelWidth);
  const focusPanelWidth = useReaderPreferencesStore((state) => state.focusPanelWidth);
  const autoMarkKnown = useReaderPreferencesStore((state) => state.autoMarkKnownOnPageTurn);
  const autoMarkLearning = useReaderPreferencesStore((state) => state.autoMarkLearningOnClick);
  const showWordSpaces = useReaderPreferencesStore((state) => state.showWordSpaces);
  const highlightOpacity = useReaderPreferencesStore((state) => state.highlightOpacity);
  const setPreference = useReaderPreferencesStore((state) => state.setPreference);

  const reader = useReaderMaterial(languageId, wordsPerPage);
  const [sidebarTab, setSidebarTab] = useState<ReaderSidebarTab>(() => (readerSession.languageId === languageId ? readerSession.sidebarTab : "read"));
  const [fit, setFit] = useState<{ key: string; count: number } | null>(null);
  const [wordInfo, setWordInfo] = useState<WordInfoTarget | null>(null);
  const [editingWordId, setEditingWordId] = useState<number | null>(null);
  const [quickMenu, setQuickMenu] = useState<ReaderQuickMenuState | null>(null);
  // The segment highlight and the translation popup belong to the page they
  // were made on: a re-render of the tokens (page turn, fit, font or spacing
  // change) closes the popup and clears the highlight, as in the legacy reader.
  const [segment, setSegment] = useState<{ layout: ReaderLayout; range: SegmentRange } | null>(null);
  const [translation, setTranslation] = useState<(ReaderTranslationState & { layout: ReaderLayout; fontSize: number }) | null>(null);

  const layoutRef = useRef<HTMLElement | null>(null);
  const sidebarRef = useRef<HTMLElement | null>(null);
  const openButtonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const readerTextRef = useRef<HTMLDivElement | null>(null);
  const wordInfoRef = useRef<HTMLElement | null>(null);
  const gesturesRef = useRef<ReaderGestures | null>(null);
  const selectionRef = useRef<number | null>(null);
  // The sidebar column's width while it animates open or closed (null at rest).
  const sidebarColumnWidth = useRef<number | null>(null);
  const selectionSequence = useRef(0);
  const pageTurnInProgress = useRef(false);
  const pendingFlip = useRef<PageDirection | null>(null);

  // ------------------------------------------------------------ page data

  const data = reader.data;
  const material = data?.material ?? null;
  const ready = Boolean(data?.translationStatus?.ready);
  const languageName = material?.languageName;
  const fetchedTokens = ready && data ? data.tokens : NO_TOKENS;
  const fitMode = wordsPerPage === "fit";
  const tokensKey = fetchedTokens.length
    ? `${material?.id}:${data?.start}:${fetchedTokens.length}:${fetchedTokens[0].id}:${fetchedTokens[fetchedTokens.length - 1].id}`
    : "";
  const visibleTokens = useMemo(() => {
    if (!fitMode) {
      return fetchedTokens;
    }
    // A new page renders only once it has been fitted, so it never flashes overfull.
    return fit && fit.key === tokensKey ? fetchedTokens.slice(0, fit.count) : NO_TOKENS;
  }, [fetchedTokens, fit, fitMode, tokensKey]);
  const layout = useMemo(() => layoutReaderTokens(visibleTokens, languageName, showWordSpaces), [languageName, showWordSpaces, visibleTokens]);
  const tokensById = useMemo(() => new Map(visibleTokens.map((token) => [token.id, token])), [visibleTokens]);
  const eligible = isSegmentTranslationEligible(material, user);
  const openTranslation = translation && translation.layout === layout && translation.fontSize === fontSize ? translation : null;
  const segmentRange = segment && segment.layout === layout ? segment.range : null;
  const wordInfoToken = !ready
    ? null
    : wordInfo
      ? (tokensById.get(wordInfo.tokenId) ?? visibleTokens.find((token) => token.wordId === wordInfo.wordId) ?? wordInfo.snapshot)
      : null;
  const selectedTokenId = quickMenu?.token.id ?? wordInfoToken?.id ?? null;
  const pageStatus = material && ready ? readerPageStatus(data?.start ?? 0, visibleTokens.length, material.wordCount) : null;

  // ------------------------------------------------------------ actions

  const closeWordInfo = useCallback(() => {
    setWordInfo(null);
    setEditingWordId(null);
  }, []);

  const closeTranslation = useCallback(() => {
    selectionRef.current = null;
    setTranslation(null);
    gesturesRef.current?.clearSegmentSelection();
  }, []);

  const setFocusMode = useCallback(
    (enabled: boolean) => {
      setPreference("focusMode", enabled);
      closeWordInfo();
    },
    [closeWordInfo, setPreference]
  );

  const refresh = useCallback(() => refreshStudyData(queryClient), [queryClient]);
  const segmentAnchorRect = useCallback(() => gesturesRef.current?.segmentAnchorRect() ?? null, []);

  const turnPage = useCallback(
    async (direction: PageDirection) => {
      if (pageTurnInProgress.current || !material || !ready || !data) {
        return;
      }
      const nextStart = pageTurnStart({ direction, start: data.start, visibleCount: visibleTokens.length, wordCount: material.wordCount, wordsPerPage });
      if (nextStart === null) {
        return;
      }
      pageTurnInProgress.current = true;
      try {
        // Auto-marking known applies only when advancing; going back must not
        // mark the page you are leaving as known. Capture the words now, before
        // the tokens are replaced, then turn the page immediately and mark them
        // in the background so the user never waits on the network.
        const wordIdsToMark =
          direction === "next" && autoMarkKnown
            ? [...new Set(visibleTokens.filter((token) => token.wordId && normalizeStatus(token.status) === "unknown").map((token) => token.wordId))]
            : [];
        const result = await reader.load(material.id, nextStart);
        if (result) {
          pendingFlip.current = direction;
        }
        if (wordIdsToMark.length) {
          // One atomic bulk request; refresh either way so the reader, dashboard
          // and known total reflect what was actually saved.
          api.words
            .setStatuses(wordIdsToMark, "known")
            .catch(() => {})
            .finally(refresh);
        }
      } catch (error) {
        toastError(error);
      } finally {
        pageTurnInProgress.current = false;
      }
    },
    [autoMarkKnown, data, material, reader, ready, refresh, visibleTokens, wordsPerPage]
  );

  const handleTokenClick = useCallback(
    async (button: HTMLElement) => {
      // Word-info and the translation popup are never shown together.
      closeTranslation();
      const token = tokensById.get(Number(button.dataset.tokenId));
      setWordInfo(token ? { tokenId: token.id, wordId: token.wordId, snapshot: token } : null);
      const wordId = Number(button.dataset.wordId);
      api.words.click(wordId).catch(() => {});
      const status = normalizeStatus(visibleTokens.find((entry) => entry.wordId === wordId)?.status);
      if (!autoMarkLearning || !wordId || status !== "unknown") {
        return;
      }
      try {
        await api.words.setStatus(wordId, "learning");
        reader.updateWordTokens(wordId, { status: "learning" });
        await refresh();
      } catch (error) {
        toastError(error);
      }
    },
    [autoMarkLearning, closeTranslation, reader, refresh, tokensById, visibleTokens]
  );

  const applyQuickMenuAction = useCallback(
    async (token: ReaderToken, key: QuickMenuActionKey | null) => {
      const action = QUICK_MENU_ACTIONS.find((entry) => entry.key === key);
      const wordId = Number(token.wordId);
      if (!action || !wordId) {
        return;
      }
      if (action.status) {
        await api.words.setStatus(wordId, action.status);
        reader.updateWordTokens(wordId, { status: action.status, wantToPractice: action.status === "learning" ? token.wantToPractice : 0 });
      } else {
        if (normalizeStatus(token.status) !== "learning") {
          await api.words.setStatus(wordId, "learning");
        }
        const wantToPractice = !token.wantToPractice;
        await api.words.setWantToPractice(wordId, wantToPractice);
        reader.updateWordTokens(wordId, { status: "learning", wantToPractice: wantToPractice ? 1 : 0 });
      }
      await refresh();
    },
    [reader, refresh]
  );

  const handleSegmentSelected = useCallback(
    async ({ words, sourceText, anchorRect }: SegmentSelectedDetail) => {
      const id = ++selectionSequence.current;
      selectionRef.current = id;
      closeWordInfo();
      setTranslation({ id, words, anchorRect, status: "translating", layout, fontSize });
      // Late results for a closed or replaced popup are dropped.
      const isCurrent = () => selectionRef.current === id;
      const update = (next: Partial<ReaderTranslationState>) => setTranslation((current) => (current && current.id === id ? { ...current, ...next } : current));
      try {
        const result = await translate(sourceText, {
          onStatus: (status, info) => {
            if (!isCurrent()) {
              return;
            }
            if (status === "loading-model") {
              update({ status, progress: info });
            } else if (status === "translating") {
              update({ status });
            }
          }
        });
        if (isCurrent()) {
          update({ status: "done", targetText: result.targetText });
        }
      } catch (error) {
        const errorCode = error instanceof TranslationError ? error.code : "failed";
        if (errorCode !== "superseded" && isCurrent()) {
          update({ status: "error", errorCode });
        }
      }
    },
    [closeWordInfo, fontSize, layout]
  );

  const saveOverride = useCallback(
    async (value: string | null) => {
      if (!wordInfoToken) {
        return;
      }
      const { wordId, canonicalTranslation } = wordInfoToken;
      try {
        const updated = await api.words.setTranslationOverride(wordId, value);
        setEditingWordId(null);
        reader.updateWordTokens(wordId, {
          translation: updated.translation,
          translationOverride: updated.translationOverride,
          canonicalTranslation: updated.canonicalTranslation || canonicalTranslation || ""
        });
      } catch (error) {
        toastError(error);
      }
    },
    [reader, wordInfoToken]
  );

  const changeStatus = useCallback(
    async (wordId: number, status: WordStatus) => {
      try {
        await api.words.setStatus(wordId, status);
        await reader.reload();
        closeWordInfo();
        await refresh();
      } catch (error) {
        toastError(error);
      }
    },
    [closeWordInfo, reader, refresh]
  );

  const changePractice = useCallback(
    async (wordId: number, wantToPractice: boolean) => {
      try {
        await api.words.setWantToPractice(wordId, wantToPractice);
        // Keep the cached tokens in sync so reopening the popup is accurate.
        reader.updateWordTokens(wordId, { wantToPractice: wantToPractice ? 1 : 0 });
        await refresh();
      } catch {
        // The token is unchanged, so the box returns to what persisted.
      }
    },
    [reader, refresh]
  );

  const { select: selectMaterial, load: loadMaterial } = reader;
  // Stable: MaterialList's auto-open of a finished import runs in an effect that depends on it.
  const openMaterial = useCallback(
    (item: MaterialListItem) => {
      if (item.translationStatus && !item.translationStatus.ready) {
        return;
      }
      selectMaterial(item.id);
      setSidebarTab("read");
      loadMaterial(item.id).catch(toastError);
    },
    [loadMaterial, selectMaterial]
  );

  function handleMaterialDeleted(materialId: number) {
    if (materialId === reader.selectedMaterialId) {
      closeWordInfo();
      reader.clear();
    }
  }

  function changeSidebarTab(value: string) {
    const tab = value as ReaderSidebarTab;
    setSidebarTab(tab);
    if (tab !== "read") {
      setPreference("sidebarCollapsed", false);
    }
  }

  function changeWordsPerPage(value: string) {
    const next: ReaderWordsPerPage = value === "fit" ? "fit" : Number(value);
    setPreference("wordsPerPage", next);
    reader.reload({ wordsPerPage: next }).catch(toastError);
  }

  // ------------------------------------------------------------ layout

  /** Sizes the sidebar and panel through CSS variables (legacy renderReaderSidebar). */
  const applyLayout = useCallback(() => {
    const layoutElement = layoutRef.current;
    const panel = panelRef.current;
    if (!layoutElement || !panel) {
      return;
    }
    // Measure in the right mode: the shell sets the same body class, but only after this effect.
    document.body.classList.toggle("is-reader-focus", focusMode);
    const viewportWidth = document.documentElement.clientWidth;
    const size = computeReaderLayout({
      focusMode,
      mobile: isMobile,
      viewportWidth,
      viewportHeight: window.innerHeight,
      panelTop: panel.getBoundingClientRect().top,
      sidebarCollapsed,
      sidebarWidth: sidebarColumnWidth.current ?? undefined,
      savedPanelWidth: focusMode ? focusPanelWidth : panelWidth
    });
    const vars: Record<string, string> = {
      "--readerViewportWidth": `${viewportWidth}px`,
      "--readerViewportOffset": `${layoutElement.parentElement?.getBoundingClientRect().left ?? 0}px`,
      "--readerSidebarWidth": `${size.sidebarWidth}px`,
      "--readerSidebarOpenWidth": `${readerSidebarColumnWidth(false, isMobile)}px`,
      "--readerPanelMinWidth": `${size.minPanelWidth}px`,
      "--readerPanelMaxHeight": `${size.maxPanelHeight}px`,
      "--readerPanelMinHeight": `${size.minPanelHeight}px`,
      "--readerPanelWidth": `${size.panelWidth}px`,
      "--readerPanelHeight": `${size.panelHeight}px`,
      "--readerPanelOffset": `${size.panelOffset}px`
    };
    for (const [name, value] of Object.entries(vars)) {
      layoutElement.style.setProperty(name, value);
    }
    if (sidebarRef.current && openButtonRef.current) {
      openButtonRef.current.style.setProperty("--readerSidebarOpenTop", `${sidebarRef.current.getBoundingClientRect().top + 14}px`);
    }
  }, [focusMode, focusPanelWidth, isMobile, panelWidth, sidebarCollapsed]);

  useLayoutEffect(() => {
    applyLayout();
  }, [applyLayout, sidebarTab]);

  // Fit to page: probe how many fetched tokens fit, before the page is painted.
  const measureFit = useCallback(() => {
    const readerText = readerTextRef.current;
    if (!fitMode || !tokensKey || !readerText) {
      return;
    }
    const count = measureFitTokenCount(readerText, fetchedTokens, languageName, showWordSpaces);
    if (count !== null) {
      setFit((current) => (current && current.key === tokensKey && current.count === count ? current : { key: tokensKey, count }));
    }
  }, [fetchedTokens, fitMode, languageName, showWordSpaces, tokensKey]);

  useLayoutEffect(() => {
    measureFit();
  }, [measureFit, fontSize]);

  // After a new page is rendered: reset the scroll position (fit mode) and play the page-flip animation.
  useLayoutEffect(() => {
    const readerText = readerTextRef.current;
    if (!readerText || !visibleTokens.length) {
      return;
    }
    if (fitMode) {
      readerText.scrollTop = 0;
    }
    const direction = pendingFlip.current;
    pendingFlip.current = null;
    if (!direction || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    readerText.classList.remove("is-page-flip-next", "is-page-flip-prev");
    void readerText.offsetWidth;
    readerText.classList.add(direction === "next" ? "is-page-flip-next" : "is-page-flip-prev");
  }, [fitMode, visibleTokens]);

  // ------------------------------------------------------------ listeners

  // The latest state and handlers, for the document and gesture listeners bound once below.
  const reload = reader.reload;
  const latest = useRef({
    applyLayout,
    measureFit,
    turnPage,
    handleTokenClick,
    applyQuickMenuAction,
    handleSegmentSelected,
    closeWordInfo,
    closeTranslation,
    setFocusMode,
    reload
  });
  const latestState = useRef({ eligible, tokensById, layout, focusMode, isMobile, translationOpen: false, wordInfoOpen: false });
  useLayoutEffect(() => {
    latest.current = {
      applyLayout,
      measureFit,
      turnPage,
      handleTokenClick,
      applyQuickMenuAction,
      handleSegmentSelected,
      closeWordInfo,
      closeTranslation,
      setFocusMode,
      reload
    };
    latestState.current = {
      eligible,
      tokensById,
      layout,
      focusMode,
      isMobile,
      translationOpen: openTranslation !== null,
      wordInfoOpen: wordInfoToken !== null
    };
  });

  useEffect(() => {
    const readerText = readerTextRef.current;
    if (!readerText) {
      return;
    }
    const gestures = attachReaderGestures(readerText, {
      isSegmentEligible: () => latestState.current.eligible,
      tokenById: (tokenId) => latestState.current.tokensById.get(tokenId),
      onTokenClick: (button) => void latest.current.handleTokenClick(button),
      onTurnPage: (direction) => void latest.current.turnPage(direction),
      onQuickMenuShow: (token, origin) => {
        latest.current.closeWordInfo();
        setQuickMenu({ token, origin, selectedKey: null });
      },
      onQuickMenuSelect: (selectedKey) => setQuickMenu((menu) => (menu && menu.selectedKey !== selectedKey ? { ...menu, selectedKey } : menu)),
      onQuickMenuHide: () => setQuickMenu(null),
      onQuickMenuRelease: (token, key) => {
        latest.current.applyQuickMenuAction(token, key).catch(() => latest.current.reload().catch(() => {}));
      },
      onSegmentRange: (range) => setSegment(range ? { layout: latestState.current.layout, range } : null)
    });
    gesturesRef.current = gestures;
    const handleSegment = (event: Event) => void latest.current.handleSegmentSelected((event as CustomEvent<SegmentSelectedDetail>).detail);
    document.addEventListener(SEGMENT_SELECTED_EVENT, handleSegment);
    return () => {
      document.removeEventListener(SEGMENT_SELECTED_EVENT, handleSegment);
      gestures.detach();
      gesturesRef.current = null;
      selectionRef.current = null;
    };
  }, []);

  useEffect(() => {
    function handleKeydown(event: KeyboardEvent) {
      const { focusMode: inFocusMode, translationOpen, wordInfoOpen, isMobile: mobile } = latestState.current;
      // Escape closes the top layer first: the translation popup, then the mobile word-info sheet, then focus mode.
      const wordInfoSheetOpen = mobile && wordInfoOpen && !translationOpen;
      if (!event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && !isTextInputTarget(event.target)) {
        // Widgets that own the arrow keys (tabs, selects, menus) prevent them first.
        if (event.key === "ArrowLeft" && !event.defaultPrevented) {
          event.preventDefault();
          void latest.current.turnPage("prev");
        } else if (event.key === "ArrowRight" && !event.defaultPrevented) {
          event.preventDefault();
          void latest.current.turnPage("next");
        } else if (event.key === "Escape" && inFocusMode && !translationOpen && !wordInfoSheetOpen) {
          // An open translation popup takes the Escape; focus mode exits on the next one.
          latest.current.setFocusMode(false);
        }
      }
      if (event.key === "Escape" && translationOpen) {
        latest.current.closeTranslation();
      } else if (event.key === "Escape" && wordInfoSheetOpen) {
        latest.current.closeWordInfo();
      }
    }
    function handleClick(event: MouseEvent) {
      // The event path, not the target's ancestors: a click inside word-info may
      // have re-rendered (detached) its target by the time it reaches the document.
      const path = event.composedPath();
      const popup = wordInfoRef.current;
      if (
        !latestState.current.wordInfoOpen ||
        (popup && path.includes(popup)) ||
        path.some((node) => node instanceof Element && node.classList.contains("reader-token"))
      ) {
        return;
      }
      latest.current.closeWordInfo();
    }
    let frame = 0;
    function handleResize() {
      latest.current.applyLayout();
    }
    // Re-measure once the route's layout has settled (legacy renderReaderSidebarAfterLayout).
    frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => latest.current.applyLayout());
    });
    document.addEventListener("keydown", handleKeydown);
    document.addEventListener("click", handleClick);
    window.addEventListener("resize", handleResize);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeydown);
      document.removeEventListener("click", handleClick);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  // Slide the desktop sidebar column open or closed, re-laying out the panel on
  // every frame so it never jumps (this runs after the applyLayout effect, so
  // it re-applies the starting width before paint); fit to page once settled.
  const { isAnimating: isSidebarAnimating } = useAnimatedSidebar({
    collapsed: sidebarCollapsed,
    enabled: !focusMode && !isMobile,
    restWidth: (collapsed) => readerSidebarColumnWidth(collapsed, false),
    onFrame: (width) => {
      sidebarColumnWidth.current = width;
      latest.current.applyLayout();
    },
    onSettled: () => latest.current.measureFit()
  });

  // Re-fit whenever the text area changes size (window, sidebar, panel or focus mode).
  useEffect(() => {
    const readerText = readerTextRef.current;
    if (!readerText) {
      return;
    }
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      // A sliding sidebar re-fits once, when it has settled.
      if (isSidebarAnimating()) {
        return;
      }
      frame = requestAnimationFrame(() => latest.current.measureFit());
    });
    observer.observe(readerText);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [isSidebarAnimating]);

  // Remember the sidebar tab for the next visit to the reader.
  useEffect(() => {
    readerSession.sidebarTab = sidebarTab;
  }, [sidebarTab]);

  // ------------------------------------------------------------ render

  const readTab = isMobile && sidebarTab === "read";
  const desktopTab: ReaderSidebarTab = sidebarTab === "settings" ? "settings" : "documents";
  let title = t("reader.title");
  let meta = "";
  let content: ReactNode = null;
  if (!reader.selectedMaterialId) {
    content = <p className="empty">{t("reader.selectMaterial")}</p>;
  } else if (material && !ready) {
    title = material.title || t("reader.title");
    content = <p className="empty">{t("reader.translatingWait")}</p>;
  } else if (material) {
    title = material.title || t("reader.title");
    meta = t("reader.readerMeta", { words: formatCount(material.wordCount), language: material.languageName });
    content = <ReaderTokens layout={layout} selectedTokenId={selectedTokenId} segmentRange={segmentRange} />;
  }

  return (
    <Tabs asChild value={isMobile ? sidebarTab : desktopTab} onValueChange={changeSidebarTab} className="tab-view block gap-0">
      <section id="readerView">
        <ReaderSidebarTabList
          id="readerSidebarTabs"
          tabs={["read", "documents", "settings"]}
          activeTab={sidebarTab}
          className="mobile-reader-tabs mb-3 grid grid-cols-3"
        />
        <SidebarOpenButton
          ref={openButtonRef}
          id="readerSidebarOpen"
          className="reader-sidebar-open top-[86px] mobile:top-3"
          collapsed={!focusMode && !readTab && sidebarCollapsed}
          onOpen={() => setPreference("sidebarCollapsed", false)}
          label={t("reader.openSidebar")}
        />
        <SidebarLayout
          ref={layoutRef}
          collapsed={sidebarCollapsed}
          className={cn("reader-layout relative grid items-start", isMobile && (sidebarTab === "read" ? "is-reader-read-panel" : "is-reader-side-panel"))}
        >
          <ReaderSidebar
            sidebarRef={sidebarRef}
            hidden={readTab}
            desktopTab={desktopTab}
            showWordSpacesOption={isWordSpacingLanguage(languageName) || isWordSpacingLanguage(studyLanguageName)}
            selectedMaterialId={reader.selectedMaterialId}
            onOpenMaterial={openMaterial}
            onMaterialDeleted={handleMaterialDeleted}
          />
          <section
            ref={panelRef}
            className="reader-panel relative grid overflow-hidden rounded-r-lg border border-line bg-panel p-5 shadow-panel"
            hidden={isMobile && sidebarTab !== "read"}
          >
            <button
              className={cn("reader-focus-toggle reader-focus-command", FOCUS_BUTTON)}
              type="button"
              aria-pressed="false"
              onClick={() => setFocusMode(true)}
            >
              {t("reader.focus")}
            </button>
            <button
              id="readerFocusExit"
              className={cn("reader-focus-exit", FOCUS_BUTTON)}
              type="button"
              aria-label={t("reader.exitFocus")}
              hidden={!focusMode}
              onClick={() => setFocusMode(false)}
            >
              {t("reader.exit")}
            </button>
            <div className="reader-toolbar mb-4 flex items-end justify-between gap-4 mobile:grid">
              <div>
                <h2 id="readerTitle" className="text-xl font-bold">
                  {title}
                </h2>
                <p id="readerMeta" className="hint mt-1 min-h-5 text-sm text-secondary">
                  {meta}
                </p>
              </div>
              <div className="reader-controls grid grid-cols-[minmax(180px,220px)_minmax(130px,160px)] items-end gap-3">
                <label className="grid gap-1.5 text-sm font-semibold text-label">
                  <span>{t("reader.fontSize")}</span>
                  <input
                    id="readerFontSize"
                    className="accent-brand"
                    type="range"
                    min="16"
                    max="34"
                    value={fontSize}
                    onChange={(event) => setPreference("fontSize", Number(event.target.value))}
                  />
                </label>
                <div className="grid gap-1.5 text-sm font-semibold text-label">
                  <span id="readerWordsPerPageLabel">{t("reader.wordsPerPage")}</span>
                  <Select value={String(wordsPerPage)} onValueChange={changeWordsPerPage}>
                    <SelectTrigger
                      id="readerWordsPerPage"
                      aria-labelledby="readerWordsPerPageLabel"
                      className="min-h-11 w-full rounded-md border-line bg-panel px-3 text-base font-normal text-main outline-none focus:border-brand focus:ring-2 focus:ring-focus data-[size=default]:h-auto"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {WORDS_PER_PAGE_OPTIONS.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option === "fit" ? t("reader.fitToPage") : option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <div
              id="readerProgress"
              className={cn("reader-progress", !pageStatus && "is-hidden")}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pageStatus?.progressPercent ?? 0}
              aria-label={t("reader.progressLabel")}
            >
              <div
                id="readerProgressBar"
                className="reader-progress-bar"
                style={{ "--readerProgress": `${pageStatus?.progressPercent ?? 0}%` } as CSSProperties}
              />
            </div>
            <div
              ref={readerTextRef}
              id="readerText"
              className={cn(
                "reader-text h-full min-h-0 overflow-auto rounded-lg border border-line bg-reader p-6 leading-[1.9]",
                eligible && "is-segment-selectable"
              )}
              style={{ "--readerFontSize": `${fontSize}px`, "--readerHighlightOpacity": String(highlightOpacity) } as CSSProperties}
            >
              {content}
            </div>
            <div className="reader-page-actions mt-4 grid items-center gap-3.5">
              <div className="reader-pagination-controls flex items-center justify-center gap-3.5">
                <button
                  id="readerPrevPage"
                  className={PAGE_BUTTON}
                  type="button"
                  disabled={!pageStatus || pageStatus.prevDisabled}
                  onClick={() => void turnPage("prev")}
                >
                  {t("reader.previous")}
                </button>
                <span id="readerPageStatus" className="hint text-sm text-secondary">
                  {pageStatus
                    ? t("reader.pageStatus", { start: formatCount(pageStatus.first), end: formatCount(pageStatus.end), total: formatCount(pageStatus.total) })
                    : ""}
                </span>
                <button
                  id="readerNextPage"
                  className={PAGE_BUTTON}
                  type="button"
                  disabled={!pageStatus || pageStatus.nextDisabled}
                  onClick={() => void turnPage("next")}
                >
                  {t("reader.next")}
                </button>
              </div>
            </div>
            <ReaderWordInfo
              token={wordInfoToken}
              readerTextRef={readerTextRef}
              popupRef={wordInfoRef}
              isMobile={isMobile}
              mobileFocus={isMobile && focusMode}
              editing={wordInfoToken !== null && editingWordId === wordInfoToken.wordId}
              onEditOverride={() => wordInfoToken && setEditingWordId(wordInfoToken.wordId)}
              onCancelOverride={() => setEditingWordId(null)}
              onSaveOverride={saveOverride}
              onClose={closeWordInfo}
              onStatusChange={changeStatus}
              onPracticeChange={changePractice}
            />
            <ReaderTranslationPopup
              translation={openTranslation}
              getAnchorRect={segmentAnchorRect}
              readerTextRef={readerTextRef}
              isMobile={isMobile}
              onClose={closeTranslation}
            />
          </section>
        </SidebarLayout>
        {quickMenu ? <ReaderQuickMenu menu={quickMenu} /> : null}
      </section>
    </Tabs>
  );
}

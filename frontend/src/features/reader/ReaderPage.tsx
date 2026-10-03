import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Navigate, useLocation, useNavigate, useParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toastError } from "@/components/app/toast";
import { libraryPath } from "@/app/route-paths";
import { api, queryKeys } from "@/lib/api";
import { refreshStudyData } from "@/lib/api/queries";
import type { ReaderToken, WordStatus } from "@/lib/api/types";
import { useIsMobileLayout } from "@/lib/hooks/use-media-query";
import { useFormatCount, useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useReaderPreferencesStore, type ReaderWordsPerPage } from "@/stores/reader-preferences";
import { useSessionStore } from "@/stores/session";
import { useStudyLanguageStore } from "@/stores/study-language";
import { QUICK_MENU_ACTIONS, type QuickMenuActionKey } from "./quick-menu";
import { attachReaderGestures, SEGMENT_SELECTED_EVENT, type ReaderGestures, type SegmentRange, type SegmentSelectedDetail } from "./reader-gestures";
import { measureFitTokenCount } from "./reader-fit";
import { computeReaderLayout } from "./reader-layout";
import { pageTurnStart, readerPageStatus, type PageDirection } from "./reader-pagination";
import { isWordSpacingLanguage, layoutReaderTokens, normalizeStatus, type ReaderLayout } from "./reader-tokens";
import { ReaderQuickMenu, type ReaderQuickMenuState } from "./ReaderQuickMenu";
import { ReaderSettings, READER_SETTINGS_ATTRIBUTE } from "./ReaderSettings";
import { ReaderTokens } from "./ReaderTokens";
import { ReaderTranslationPopup, type ReaderTranslationState } from "./ReaderTranslationPopup";
import { ReaderWordInfo } from "./ReaderWordInfo";
import { isSegmentTranslationEligible } from "./segment-text";
import { translate, TranslationError } from "./translation/translation.service";
import { useReaderMaterial } from "./use-reader-material";
import "./reader.css";

const NO_TOKENS: ReaderToken[] = [];
const PAGE_BUTTON = "secondary-button min-h-10 rounded-md border border-line bg-panel px-4 text-sm font-bold text-brand hover:bg-hover";

/** Word-info target: the tapped token, with a snapshot kept for when the page no longer holds it. */
interface WordInfoTarget {
  tokenId: number;
  wordId: number;
  snapshot: ReaderToken;
}

function isTextInputTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

/** Whether the target is inside the settings panel or its Aa button, whose keys and clicks the page leaves alone. */
function isSettingsTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest(`[${READER_SETTINGS_ATTRIBUTE}]`));
}

/** The reader route (/reader/:materialId). Keyed on the study language, so a switch starts from that language's state; a malformed id goes to the Library. */
export default function ReaderPage() {
  const languageId = useStudyLanguageStore((state) => state.selectedId);
  const materialId = Number(useParams().materialId);
  if (!Number.isInteger(materialId) || materialId <= 0) {
    return <Navigate to={libraryPath()} replace />;
  }
  return <ReaderScreen key={languageId ?? "none"} languageId={languageId} materialId={materialId} />;
}

/**
 * The reader (ported from views/reader.js and reader.controller.js): the
 * distraction-free reading view with a top bar (title, Aa settings, exit),
 * token pages, pagination, word-info, the radial quick menu and sentence
 * translation.
 */
function ReaderScreen({ languageId, materialId }: { languageId: number | null; materialId: number }) {
  const t = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const formatCount = useFormatCount();
  const queryClient = useQueryClient();
  const user = useSessionStore((state) => state.user);
  const studyLanguageName = useStudyLanguageStore((state) => state.selectedName);
  const isMobile = useIsMobileLayout();
  const wordsPerPage = useReaderPreferencesStore((state) => state.wordsPerPage);
  const fontSize = useReaderPreferencesStore((state) => state.fontSize);
  const focusPanelWidth = useReaderPreferencesStore((state) => state.focusPanelWidth);
  const autoMarkKnown = useReaderPreferencesStore((state) => state.autoMarkKnownOnPageTurn);
  const autoMarkLearning = useReaderPreferencesStore((state) => state.autoMarkLearningOnClick);
  const showWordSpaces = useReaderPreferencesStore((state) => state.showWordSpaces);
  const highlightOpacity = useReaderPreferencesStore((state) => state.highlightOpacity);
  const setPreference = useReaderPreferencesStore((state) => state.setPreference);

  const reader = useReaderMaterial(languageId, wordsPerPage, materialId, () => navigate(libraryPath(), { replace: true }));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [fit, setFit] = useState<{ key: string; count: number } | null>(null);
  const [wordInfo, setWordInfo] = useState<WordInfoTarget | null>(null);
  const [editingWordId, setEditingWordId] = useState<number | null>(null);
  const [quickMenu, setQuickMenu] = useState<ReaderQuickMenuState | null>(null);
  // The segment highlight and the translation popup belong to the page they
  // were made on: a re-render of the tokens (page turn, fit, font or spacing
  // change) closes the popup and clears the highlight, as in the legacy reader.
  const [segment, setSegment] = useState<{ layout: ReaderLayout; range: SegmentRange } | null>(null);
  const [translation, setTranslation] = useState<(ReaderTranslationState & { layout: ReaderLayout; fontSize: number }) | null>(null);

  const layoutRef = useRef<HTMLDivElement | null>(null);
  const readerTextRef = useRef<HTMLDivElement | null>(null);
  const wordInfoRef = useRef<HTMLElement | null>(null);
  const gesturesRef = useRef<ReaderGestures | null>(null);
  const selectionRef = useRef<number | null>(null);
  // The Escape keydown that the settings panel took (the panel closes on it, so the page leaves it alone).
  const settingsEscape = useRef<KeyboardEvent | null>(null);
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

  // Back to where the reader was opened from; a reader opened directly (no history in the app) goes to the Library.
  const exit = useCallback(() => {
    if (location.key !== "default") {
      navigate(-1);
    } else {
      navigate(libraryPath(), { replace: true });
    }
  }, [location.key, navigate]);

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

  function changeWordsPerPage(value: string) {
    const next: ReaderWordsPerPage = value === "fit" ? "fit" : Number(value);
    setPreference("wordsPerPage", next);
    reader.reload({ wordsPerPage: next }).catch(toastError);
  }

  // ------------------------------------------------------------ layout

  /** Sizes the reading panel through CSS variables (the width chosen in the settings). */
  const applyLayout = useCallback(() => {
    const layoutElement = layoutRef.current;
    if (!layoutElement) {
      return;
    }
    // Measure in the reader's layout: the shell sets the same body class, but only after this effect.
    document.body.classList.add("is-reader-focus");
    const size = computeReaderLayout({ viewportWidth: document.documentElement.clientWidth, savedPanelWidth: focusPanelWidth });
    layoutElement.style.setProperty("--readerPanelMinWidth", `${size.minPanelWidth}px`);
    layoutElement.style.setProperty("--readerPanelWidth", `${size.panelWidth}px`);
  }, [focusPanelWidth]);

  useLayoutEffect(() => {
    applyLayout();
  }, [applyLayout]);

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
    exit,
    reload
  });
  const latestState = useRef({ eligible, tokensById, layout, settingsOpen, translationOpen: false, wordInfoOpen: false });
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
      exit,
      reload
    };
    latestState.current = {
      eligible,
      tokensById,
      layout,
      settingsOpen,
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
    // Runs before the panel's own Escape handling (Radix listens later), so it sees whether the panel or one of its selects is open.
    function handleKeydownCapture(event: KeyboardEvent) {
      settingsEscape.current = event.key === "Escape" && latestState.current.settingsOpen ? event : null;
    }
    function handleKeydown(event: KeyboardEvent) {
      const { translationOpen, wordInfoOpen } = latestState.current;
      // Escape closes the top layer first: the settings panel, then the translation popup, then word-info, then the reader exits.
      if (event.key === "Escape" && event === settingsEscape.current) {
        return;
      }
      const wordInfoClosable = wordInfoOpen && !translationOpen;
      if (!event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && !isTextInputTarget(event.target) && !isSettingsTarget(event.target)) {
        // Widgets that own the arrow keys (tabs, selects, menus) prevent them first.
        if (event.key === "ArrowLeft" && !event.defaultPrevented) {
          event.preventDefault();
          void latest.current.turnPage("prev");
        } else if (event.key === "ArrowRight" && !event.defaultPrevented) {
          event.preventDefault();
          void latest.current.turnPage("next");
        } else if (event.key === "Escape" && !translationOpen && !wordInfoClosable) {
          // An open popup takes the Escape; the reader exits on the next one.
          latest.current.exit();
        }
      }
      if (event.key === "Escape" && translationOpen) {
        latest.current.closeTranslation();
      } else if (event.key === "Escape" && wordInfoClosable) {
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
        path.some((node) => node instanceof Element && node.hasAttribute(READER_SETTINGS_ATTRIBUTE)) ||
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
    document.addEventListener("keydown", handleKeydownCapture, true);
    document.addEventListener("keydown", handleKeydown);
    document.addEventListener("click", handleClick);
    window.addEventListener("resize", handleResize);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeydownCapture, true);
      document.removeEventListener("keydown", handleKeydown);
      document.removeEventListener("click", handleClick);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  // Re-fit whenever the text area changes size (window or text width).
  useEffect(() => {
    const readerText = readerTextRef.current;
    if (!readerText) {
      return;
    }
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => latest.current.measureFit());
    });
    observer.observe(readerText);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  // Record the work as last opened (C1) once it is on screen, so the Library lists it first.
  const openedMaterialId = material?.id;
  useEffect(() => {
    if (!openedMaterialId) {
      return;
    }
    api.materials
      .markOpened(openedMaterialId)
      .then(() => queryClient.invalidateQueries({ queryKey: queryKeys.library.all }))
      .catch(() => {});
  }, [openedMaterialId, queryClient]);

  // ------------------------------------------------------------ render

  let title = t("reader.title");
  let content: ReactNode = null;
  if (material && !ready) {
    title = material.title || t("reader.title");
    content = <p className="empty">{t("reader.translatingWait")}</p>;
  } else if (material) {
    title = material.title || t("reader.title");
    content = <ReaderTokens layout={layout} selectedTokenId={selectedTokenId} segmentRange={segmentRange} />;
  }

  return (
    <section id="readerView">
      <div ref={layoutRef} className="reader-layout relative grid items-start">
        <div className="reader-topbar">
          <h2 id="readerTitle" className="reader-topbar-title">
            {title}
          </h2>
          <div className="reader-topbar-actions">
            <ReaderSettings
              open={settingsOpen}
              onOpenChange={setSettingsOpen}
              showWordSpacesOption={isWordSpacingLanguage(languageName) || isWordSpacingLanguage(studyLanguageName)}
              onWordsPerPageChange={changeWordsPerPage}
            />
            <button id="readerFocusExit" className="reader-topbar-button" type="button" aria-label={t("reader.exitToLibrary")} onClick={exit}>
              {t("reader.exit")}
            </button>
          </div>
        </div>
        <section className="reader-panel relative grid overflow-hidden rounded-lg border border-line bg-panel p-5 shadow-panel">
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
            mobileFocus={isMobile}
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
      </div>
      {quickMenu ? <ReaderQuickMenu menu={quickMenu} /> : null}
    </section>
  );
}

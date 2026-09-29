import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useLayoutEffect, useRef, useState, type DragEvent, type MouseEvent, type UIEvent } from "react";
import { useShallow } from "zustand/react/shallow";
import { useConfirm } from "@/components/app/ConfirmDialog";
import { Sidebar, SidebarLayout, SidebarOpenButton } from "@/components/app/Sidebar";
import { toastError } from "@/components/app/toast";
import { api, dashboardSummaryQuery, refreshStudyData } from "@/lib/api";
import type { CollectionStats, ImportWordsResponse, Word, WordStatus } from "@/lib/api/types";
import { useIsMobileLayout } from "@/lib/hooks/use-media-query";
import { usePersistentState } from "@/lib/hooks/use-persistent-state";
import { useFormatCount, useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useStudyLanguageStore } from "@/stores/study-language";
import { useUiPreferencesStore, type WordDisplayMode } from "@/stores/ui-preferences";
import { useCollectionsViewStore } from "./collections-store";
import { collectionWordsQuery } from "./queries";
import { UploadDialog } from "./UploadDialog";
import {
  dragSelection,
  knownPercent,
  LOAD_MORE_THRESHOLD,
  parseCollectionSelection,
  parseDraggedWordIds,
  resolveCollectionSelection,
  selectRow,
  statusTargetIds,
  WORD_PAGE_SIZE,
  wordWindow,
  type CollectionSelection,
  type RowSelection
} from "./word-list";
import { WordRows } from "./WordRows";
import "./collections.css";

const SIDEBAR_COLLAPSED_KEY = "wordMarkerCollectionsSidebarCollapsed";
const DRAG_TYPE = "application/x-word-marker-words";
const NO_COLLECTIONS: CollectionStats[] = [];
const NO_WORDS: Word[] = [];
const NO_SELECTION: RowSelection = { ids: new Set(), anchorId: null };
const DISPLAY_MODES: { mode: WordDisplayMode; labelKey: string }[] = [
  { mode: "page", labelKey: "collections.displayPage" },
  { mode: "infinite", labelKey: "collections.displayInfinite" }
];
const COLLECTION_BUTTON_CLASS =
  "collection-button min-h-11 rounded-md border border-line bg-panel px-3 text-left text-sm font-semibold text-label hover:bg-hover";
const SECONDARY_BUTTON_CLASS = "secondary-button min-h-10 rounded-md border border-line bg-panel px-4 text-sm font-bold text-brand hover:bg-hover";

const parseCollapsed = (stored: string | null) => stored === "true";

/**
 * The vocab tab (#collectionsView, ported from the collections and imports
 * controllers and views/words.js): the collapsible collections sidebar with
 * CSV upload, and the word table with search, paged or infinite display,
 * row selection, status marking, translation overrides, disambiguation,
 * drag-and-drop moves between collections and deletion.
 */
export default function CollectionsPage() {
  const t = useT();
  const formatCount = useFormatCount();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const isMobile = useIsMobileLayout();
  const languageId = useStudyLanguageStore((state) => state.selectedId);
  const languageName = useStudyLanguageStore((state) => state.selectedName);
  const { storedSelection, searchInput, selectCollection, setSearch } = useCollectionsViewStore(
    useShallow((state) => ({
      storedSelection: state.selectedCollectionId,
      searchInput: state.search,
      selectCollection: state.selectCollection,
      setSearch: state.setSearch
    }))
  );
  const displayMode = useUiPreferencesStore((state) => state.wordDisplayMode);
  const setDisplayMode = useUiPreferencesStore((state) => state.setWordDisplayMode);
  const [sidebarCollapsed, setSidebarCollapsed] = usePersistentState(SIDEBAR_COLLAPSED_KEY, parseCollapsed);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [rowSelection, setRowSelection] = useState<RowSelection>(NO_SELECTION);
  const [actionError, setActionError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<{ wordId: number; status: WordStatus } | null>(null);
  const [expandedDisambiguationId, setExpandedDisambiguationId] = useState<number | null>(null);
  const [editingTranslationId, setEditingTranslationId] = useState<number | null>(null);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dropTargetId, setDropTargetId] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const [visibleCount, setVisibleCount] = useState(WORD_PAGE_SIZE);
  const workspaceRef = useRef<HTMLElement>(null);
  const openButtonRef = useRef<HTMLButtonElement>(null);
  const tableWrapRef = useRef<HTMLDivElement>(null);

  const { data: dashboard } = useQuery({ ...dashboardSummaryQuery(languageId), enabled: languageId !== null });
  const collections = dashboard?.collections ?? NO_COLLECTIONS;
  const selection = dashboard ? resolveCollectionSelection(storedSelection, collections) : storedSelection;
  const search = searchInput.trim();
  const wordsQuery = useQuery({ ...collectionWordsQuery(selection, languageId, search), placeholderData: keepPreviousData });
  const words = wordsQuery.data ?? NO_WORDS;
  const wordRange = wordWindow(words.length, displayMode, page, visibleCount);
  const visibleWords = words.slice(wordRange.start, wordRange.end);
  const hasCollections = (dashboard?.allCollections ?? collections).length > 0;
  const wordsLoaded = wordsQuery.isSuccess && !wordsQuery.isPlaceholderData;

  // Keeps the fixed re-open button level with the sidebar head while collapsed.
  useLayoutEffect(() => {
    if (!sidebarCollapsed) {
      return;
    }
    const position = () => {
      if (workspaceRef.current && openButtonRef.current) {
        const top = Math.round(workspaceRef.current.getBoundingClientRect().top + 14);
        openButtonRef.current.style.setProperty("--collectionsSidebarOpenTop", `${top}px`);
      }
    };
    position();
    window.addEventListener("resize", position);
    return () => window.removeEventListener("resize", position);
  }, [sidebarCollapsed]);

  /** Clears the row selection and the inline error, as every legacy word reload did. */
  const resetWordState = useCallback(() => {
    setRowSelection(NO_SELECTION);
    setActionError("");
  }, []);

  /** Returns to the first page / initial infinite window, scrolled to the top. */
  function resetWordWindow() {
    setPage(0);
    setVisibleCount(WORD_PAGE_SIZE);
    if (tableWrapRef.current) {
      tableWrapRef.current.scrollTop = 0;
    }
  }

  function handleSelectCollection(value: CollectionSelection) {
    selectCollection(value);
    resetWordWindow();
    resetWordState();
  }

  function handleSearch(value: string) {
    setSearch(value);
    resetWordWindow();
    resetWordState();
  }

  function handleDisplayMode(mode: WordDisplayMode) {
    setDisplayMode(mode);
    resetWordWindow();
  }

  function handleTableScroll(event: UIEvent<HTMLDivElement>) {
    if (displayMode === "page" || visibleCount >= words.length) {
      return;
    }
    const wrap = event.currentTarget;
    if (wrap.scrollHeight - wrap.scrollTop - wrap.clientHeight > LOAD_MORE_THRESHOLD) {
      return;
    }
    setVisibleCount(Math.min(visibleCount + WORD_PAGE_SIZE, words.length));
  }

  function handleSelectRow(event: MouseEvent, wordId: number) {
    setRowSelection(
      selectRow(
        rowSelection,
        words.map((entry) => entry.id),
        wordId,
        { shift: event.shiftKey, toggle: event.metaKey || event.ctrlKey }
      )
    );
  }

  async function handleStatus(wordId: number, status: WordStatus) {
    const ids = statusTargetIds(rowSelection.ids, wordId);
    setPendingStatus({ wordId, status });
    try {
      if (ids.length > 1) {
        await api.words.setStatuses(ids, status);
      } else {
        await api.words.setStatus(wordId, status);
      }
      await refreshStudyData(queryClient);
      resetWordState();
    } catch (error) {
      toastError(error);
    } finally {
      setPendingStatus(null);
    }
  }

  async function handleSaveTranslation(wordId: number, value: string | null) {
    try {
      await api.words.setTranslationOverride(wordId, value);
      await refreshStudyData(queryClient);
      setEditingTranslationId(null);
      resetWordState();
    } catch (error) {
      toastError(error);
    }
  }

  async function handleDelete() {
    const ids = Array.from(rowSelection.ids);
    if (
      !ids.length ||
      !(await confirm({ title: t("collections.deleteConfirm", { count: ids.length }), confirmLabel: t("common.delete"), destructive: true }))
    ) {
      return;
    }
    setDeleting(true);
    setActionError("");
    try {
      await api.words.remove(ids);
      await refreshStudyData(queryClient);
      resetWordState();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : t("errors.requestFailed"));
    } finally {
      setDeleting(false);
    }
  }

  function handleDragStart(event: DragEvent<HTMLTableRowElement>, wordId: number) {
    if (isMobile) {
      event.preventDefault();
      return;
    }
    const next = dragSelection(rowSelection, wordId);
    setRowSelection(next.selection);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(DRAG_TYPE, JSON.stringify(next.wordIds));
    event.dataTransfer.setData("text/plain", String(wordId));
    setDraggingId(wordId);
  }

  function handleDragEnd() {
    setDraggingId(null);
    setDropTargetId(null);
  }

  function handleDragOver(event: DragEvent<HTMLButtonElement>, collectionId: CollectionSelection) {
    if (collectionId === "all" || collectionId === selection) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropTargetId(collectionId);
  }

  async function handleDrop(event: DragEvent<HTMLButtonElement>, collectionId: CollectionSelection) {
    if (collectionId === "all") {
      return;
    }
    event.preventDefault();
    setDropTargetId(null);
    const wordIds = parseDraggedWordIds(event.dataTransfer.getData(DRAG_TYPE), event.dataTransfer.getData("text/plain"));
    if (!wordIds.length) {
      return;
    }
    setActionError("");
    try {
      await api.words.move(wordIds, collectionId);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : t("errors.requestFailed"));
      return;
    }
    await refreshStudyData(queryClient);
    resetWordState();
  }

  async function handleImported(result: ImportWordsResponse) {
    await refreshStudyData(queryClient);
    handleSelectCollection(result.collection.id);
  }

  function renderCollectionButton(id: CollectionSelection, name: string) {
    const active = id === selection;
    return (
      <button
        key={id}
        className={cn(COLLECTION_BUTTON_CLASS, active && "is-active", dropTargetId === id && "is-drop-target")}
        type="button"
        data-collection-id={id}
        aria-pressed={active}
        onClick={() => handleSelectCollection(id)}
        onDragOver={(event) => handleDragOver(event, id)}
        onDragLeave={() => setDropTargetId((current) => (current === id ? null : current))}
        onDrop={(event) => void handleDrop(event, id)}
      >
        {name}
      </button>
    );
  }

  function renderSelectedStats() {
    const stats: Omit<CollectionStats, "id" | "languageId"> | undefined =
      selection === "all"
        ? dashboard && {
            name: t("collections.all"),
            languageName,
            totalWords: dashboard.totalWords,
            knownWords: dashboard.knownWords,
            learningWords: dashboard.learningWords,
            unknownWords: dashboard.unknownWords
          }
        : (dashboard?.allCollections ?? collections).find((entry) => entry.id === selection);
    if (!stats) {
      return null;
    }
    const { knownWords, learningWords, unknownWords, totalWords } = stats;
    return (
      <>
        <span>{stats.name}</span>
        <small>{stats.languageName}</small>
        <strong>
          {formatCount(knownWords)} / {formatCount(totalWords)}
        </strong>
        <small>
          {t("progress.statusBreakdown", { known: formatCount(knownWords), learning: formatCount(learningWords), unknown: formatCount(unknownWords) })}
        </small>
        <small>{t("progress.knownPercent", { percent: knownPercent(knownWords, totalWords) })}</small>
      </>
    );
  }

  const showEmptyState = Boolean(dashboard) && wordsLoaded && !words.length;

  return (
    <section id="collectionsView" className="tab-view">
      <SidebarOpenButton
        ref={openButtonRef}
        id="collectionsSidebarOpen"
        className="collections-sidebar-open top-[120px]"
        collapsed={sidebarCollapsed}
        onOpen={() => setSidebarCollapsed(false)}
        label={t("collections.openSidebar")}
      />
      <SidebarLayout
        ref={workspaceRef}
        collapsed={sidebarCollapsed}
        className="workspace collections-workspace grid grid-cols-[minmax(220px,260px)_1fr] items-start gap-3.5 max-md:grid-cols-1"
      >
        <Sidebar
          className="collections-sidebar rounded-lg border border-line bg-panel p-3.5 shadow-panel"
          collapsed={sidebarCollapsed}
          onCollapsedChange={setSidebarCollapsed}
          toggleId="collectionsSidebarToggle"
          toggleLabel={t("collections.toggleSidebar")}
        >
          <button
            id="uploadOpenButton"
            className="collections-sidebar-upload mb-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-bold text-white hover:bg-brand-strong"
            type="button"
            onClick={() => setUploadOpen(true)}
          >
            {t("collections.upload")}
          </button>
          <label className="collections-mobile-select-wrap grid gap-1.5 text-sm font-semibold text-label">
            <span>{t("collections.collection")}</span>
            <select
              id="collectionsSelect"
              className="min-h-11 rounded-md border border-line bg-panel px-3 text-main outline-none focus:border-brand focus:ring-2 focus:ring-focus"
              value={String(selection)}
              onChange={(event) => handleSelectCollection(parseCollectionSelection(event.target.value))}
            >
              <option value="all">{t("collections.all")}</option>
              {collections.map((collection) => (
                <option key={collection.id} value={collection.id}>
                  {collection.name}
                </option>
              ))}
            </select>
          </label>
          <nav id="collectionsList" className="collections-list grid max-h-[calc(100vh-220px)] gap-1 overflow-auto" aria-label={t("collections.listLabel")}>
            {renderCollectionButton("all", t("collections.all"))}
            {collections.map((collection) => renderCollectionButton(collection.id, collection.name))}
          </nav>
        </Sidebar>

        <section className="browser-panel rounded-lg border border-line bg-panel p-5 shadow-panel">
          <div className="section-head mb-4 flex min-h-8 items-center justify-between gap-3 max-md:grid">
            <h2 className="text-base font-bold">{t("collections.wordsTitle")}</h2>
            <div className="collection-actions desktop-display-mode flex flex-wrap items-center justify-end gap-2.5 max-md:grid">
              <div
                className="display-mode-buttons grid grid-cols-2 gap-1 rounded-lg border border-line bg-muted p-1"
                role="group"
                aria-label={t("collections.displayMode")}
              >
                {DISPLAY_MODES.map(({ mode, labelKey }) => (
                  <button
                    key={mode}
                    className={cn("display-mode-button rounded-md px-3 py-2 text-sm font-semibold text-secondary", displayMode === mode && "is-active")}
                    type="button"
                    data-display-mode={mode}
                    aria-pressed={displayMode === mode}
                    onClick={() => handleDisplayMode(mode)}
                  >
                    {t(labelKey)}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="browser-tools grid items-end gap-3">
            <label className="grid gap-1.5 text-sm font-semibold text-label">
              <span>{t("collections.search")}</span>
              <input
                id="searchInput"
                className="min-h-11 rounded-md border border-line bg-panel px-3 text-main outline-none focus:border-brand focus:ring-2 focus:ring-focus"
                type="search"
                placeholder={t("collections.searchPlaceholder")}
                value={searchInput}
                onChange={(event) => handleSearch(event.target.value)}
              />
            </label>
          </div>
          <div id="selectedCollectionStats" className="selected-stats my-3 flex min-h-8 flex-wrap items-baseline gap-2.5 text-sm text-secondary">
            {renderSelectedStats()}
          </div>
          <div className="word-table-toolbar mb-2 flex items-center justify-end gap-3">
            <p id="wordActionError" className="word-action-error mr-auto text-sm font-semibold text-danger" role="alert" hidden={!actionError}>
              {actionError}
            </p>
            <div className="delete-slot flex justify-center">
              <button
                id="deleteSelectedButton"
                className="delete-toggle danger-button disabled:cursor-not-allowed disabled:opacity-50"
                type="button"
                disabled={!rowSelection.ids.size || deleting}
                onClick={() => void handleDelete()}
              >
                {t("collections.deleteSelected")}
              </button>
            </div>
          </div>
          <div
            ref={tableWrapRef}
            className={cn("table-wrap overflow-x-auto rounded-lg border border-line", displayMode !== "page" && words.length > 5 && "is-scrollable")}
            onScroll={handleTableScroll}
          >
            <table className="w-full min-w-[760px] border-collapse">
              <thead>
                <tr>
                  <th className="word-drag-header sticky top-0 z-[1] border-b border-line bg-subtle px-2 py-3" aria-hidden="true"></th>
                  <th className="sticky top-0 z-[1] border-b border-line bg-subtle px-3 py-3 text-left text-xs font-bold text-secondary uppercase">
                    {t("table.word")}
                  </th>
                  <th className="sticky top-0 z-[1] border-b border-line bg-subtle px-3 py-3 text-left text-xs font-bold text-secondary uppercase">
                    {t("table.translation")}
                  </th>
                  <th className="sticky top-0 z-[1] border-b border-line bg-subtle px-3 py-3" aria-hidden="true"></th>
                  <th className="sticky top-0 z-[1] border-b border-line bg-subtle px-3 py-3 text-left text-xs font-bold text-secondary uppercase">
                    {t("table.status")}
                  </th>
                </tr>
              </thead>
              <tbody id="wordRows">
                <WordRows
                  words={visibleWords}
                  selectedIds={rowSelection.ids}
                  expandedDisambiguationId={expandedDisambiguationId}
                  editingTranslationId={editingTranslationId}
                  pendingStatus={pendingStatus}
                  draggingId={draggingId}
                  onSelectRow={handleSelectRow}
                  onStatus={(wordId, status) => void handleStatus(wordId, status)}
                  onToggleDisambiguation={(wordId) => setExpandedDisambiguationId((current) => (current === wordId ? null : wordId))}
                  onEditTranslation={setEditingTranslationId}
                  onSaveTranslation={handleSaveTranslation}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                />
              </tbody>
            </table>
          </div>
          <div
            id="wordPagination"
            className="word-pagination mt-3 flex items-center justify-center gap-3 text-sm"
            hidden={displayMode !== "page" || !words.length}
          >
            <button
              id="wordPrevPage"
              className={SECONDARY_BUTTON_CLASS}
              type="button"
              disabled={wordRange.page <= 0}
              onClick={() => setPage(wordRange.page - 1)}
            >
              {t("collections.prevPage")}
            </button>
            <span id="wordPageStatus" className="text-secondary" role="status">
              {t("collections.pageStatus", { current: formatCount(wordRange.page + 1), total: formatCount(wordRange.totalPages) })}
            </span>
            <button
              id="wordNextPage"
              className={SECONDARY_BUTTON_CLASS}
              type="button"
              disabled={wordRange.page >= wordRange.totalPages - 1}
              onClick={() => setPage(wordRange.page + 1)}
            >
              {t("collections.nextPage")}
            </button>
          </div>
          <p id="emptyState" className="empty mt-4 text-sm text-secondary" hidden={!showEmptyState}>
            {t(hasCollections ? "collections.noSearchResults" : "collections.empty")}
          </p>
        </section>
      </SidebarLayout>
      <UploadDialog open={uploadOpen} onOpenChange={setUploadOpen} languageId={languageId} collections={collections} onImported={handleImported} />
    </section>
  );
}

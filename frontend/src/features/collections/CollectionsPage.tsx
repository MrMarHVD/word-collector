import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useLayoutEffect, useRef, useState, type DragEvent, type MouseEvent, type UIEvent } from "react";
import { useShallow } from "zustand/react/shallow";
import { useConfirm } from "@/components/app/ConfirmDialog";
import { PageHeader } from "@/components/app/PageHeader";
import { Segmented } from "@/components/app/Segmented";
import { Sidebar, SidebarLayout, SidebarOpenButton } from "@/components/app/Sidebar";
import { toastError } from "@/components/app/toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, dashboardSummaryQuery, errorMessage, refreshStudyData } from "@/lib/api";
import type { CollectionStats, ImportWordsResponse, Word, WordStatus } from "@/lib/api/types";
import { useAnimatedSidebar } from "@/lib/hooks/use-animated-sidebar";
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
import { collectionsSidebarColumnWidth } from "./collections-sidebar";
import "./collections.css";

const SIDEBAR_COLLAPSED_KEY = "wordMarkerCollectionsSidebarCollapsed";
const DRAG_TYPE = "application/x-word-marker-words";
const NO_COLLECTIONS: CollectionStats[] = [];
const NO_WORDS: Word[] = [];
const NO_SELECTION: RowSelection = { ids: new Set(), anchorId: null };
const DISPLAY_MODES: WordDisplayMode[] = ["page", "infinite"];

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
  const sidebarRef = useRef<HTMLElement>(null);
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

  // Slides the desktop sidebar column open or closed: the workspace grid takes the
  // animated width through a CSS variable (see collections.css) instead of a
  // grid-template-columns transition, which cannot interpolate here.
  useAnimatedSidebar({
    collapsed: sidebarCollapsed,
    enabled: !isMobile,
    restWidth: (collapsed) => collectionsSidebarColumnWidth(collapsed, window.innerWidth),
    sidebar: sidebarRef,
    onFrame: (width) => {
      const workspace = workspaceRef.current;
      workspace?.classList.toggle("is-sidebar-sliding", width !== null);
      if (width === null) {
        workspace?.style.removeProperty("--collectionsSidebarColumn");
      } else {
        workspace?.style.setProperty("--collectionsSidebarColumn", `${width}px`);
      }
    }
  });

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
      setActionError(errorMessage(error));
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
      setActionError(errorMessage(error));
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
      <Button
        key={id}
        variant="ghost"
        className={cn(
          "collection-button h-auto min-h-9 justify-start px-3 py-2 text-left whitespace-normal mobile:min-h-11",
          active && "bg-selected font-semibold text-brand",
          dropTargetId === id && "bg-selected ring-2 ring-primary ring-inset"
        )}
        data-collection-id={id}
        aria-pressed={active}
        onClick={() => handleSelectCollection(id)}
        onDragOver={(event) => handleDragOver(event, id)}
        onDragLeave={() => setDropTargetId((current) => (current === id ? null : current))}
        onDrop={(event) => void handleDrop(event, id)}
      >
        {name}
      </Button>
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
        <span className="font-semibold text-main">{stats.name}</span>
        <span className="text-caption">{stats.languageName}</span>
        <span className="font-semibold text-brand">
          {formatCount(knownWords)} / {formatCount(totalWords)}
        </span>
        <span className="text-caption">
          {t("progress.statusBreakdown", { known: formatCount(knownWords), learning: formatCount(learningWords), unknown: formatCount(unknownWords) })}
        </span>
        <span className="text-caption">{t("progress.knownPercent", { percent: knownPercent(knownWords, totalWords) })}</span>
      </>
    );
  }

  const showEmptyState = Boolean(dashboard) && wordsLoaded && !words.length;

  return (
    <section id="collectionsView">
      <PageHeader
        title={t("tabs.collections")}
        actions={
          <Segmented
            className="desktop-display-mode w-56 mobile:hidden"
            aria-label={t("collections.displayMode")}
            size="sm"
            value={displayMode}
            onValueChange={handleDisplayMode}
            options={DISPLAY_MODES.map((mode) => ({
              value: mode,
              label: t(mode === "page" ? "collections.displayPage" : "collections.displayInfinite"),
              itemProps: { "data-display-mode": mode }
            }))}
          />
        }
      />
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
        className="workspace collections-workspace grid grid-cols-[minmax(220px,260px)_minmax(0,1fr)] items-start gap-3.5 mobile:grid-cols-1"
      >
        <Sidebar
          ref={sidebarRef}
          className="collections-sidebar"
          collapsed={sidebarCollapsed}
          onCollapsedChange={setSidebarCollapsed}
          toggleId="collectionsSidebarToggle"
          toggleLabel={t("collections.toggleSidebar")}
        >
          <Button id="uploadOpenButton" size="lg" className="collections-sidebar-upload mb-3 w-full" onClick={() => setUploadOpen(true)}>
            {t("collections.upload")}
          </Button>
          <div className="collections-mobile-select-wrap hidden gap-1.5 mobile:grid">
            <Label htmlFor="collectionsSelect">{t("collections.collection")}</Label>
            <NativeSelect
              id="collectionsSelect"
              value={String(selection)}
              onChange={(event) => handleSelectCollection(parseCollectionSelection(event.target.value))}
            >
              <option value="all">{t("collections.all")}</option>
              {collections.map((collection) => (
                <option key={collection.id} value={collection.id}>
                  {collection.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <nav
            id="collectionsList"
            className="collections-list grid max-h-[calc(100vh-220px)] gap-1 overflow-auto mobile:hidden"
            aria-label={t("collections.listLabel")}
          >
            {renderCollectionButton("all", t("collections.all"))}
            {collections.map((collection) => renderCollectionButton(collection.id, collection.name))}
          </nav>
        </Sidebar>

        <Card className="browser-panel gap-0 p-5">
          <div className="browser-tools grid items-end gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="searchInput">{t("collections.search")}</Label>
              <Input
                id="searchInput"
                type="search"
                placeholder={t("collections.searchPlaceholder")}
                value={searchInput}
                onChange={(event) => handleSearch(event.target.value)}
              />
            </div>
          </div>
          <div className="my-3 flex min-h-8 items-center gap-3">
            <div id="selectedCollectionStats" className="selected-stats flex min-w-0 flex-1 flex-wrap items-baseline gap-2.5 text-body text-secondary">
              {renderSelectedStats()}
            </div>
            <div className="word-table-toolbar flex shrink-0 items-center gap-3 mobile:hidden">
              <p id="wordActionError" className="word-action-error text-body font-medium text-destructive" role="alert" hidden={!actionError}>
                {actionError}
              </p>
              <Button
                id="deleteSelectedButton"
                variant="destructive"
                size="sm"
                disabled={!rowSelection.ids.size || deleting}
                onClick={() => void handleDelete()}
              >
                {t("collections.deleteSelected")}
              </Button>
            </div>
          </div>
          <div
            ref={tableWrapRef}
            className={cn(
              "table-wrap overflow-auto border-y border-line mobile:overflow-visible mobile:border-y-0 [&_[data-slot=table-container]]:overflow-visible",
              displayMode !== "page" && words.length > 5 && "max-h-[max(320px,calc(100vh-390px))] mobile:max-h-none"
            )}
            onScroll={handleTableScroll}
          >
            <Table className="min-w-[760px] mobile:block mobile:min-w-0">
              <TableHeader className="mobile:hidden">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="sticky top-0 z-[1] w-7 bg-panel px-2" aria-hidden="true"></TableHead>
                  <TableHead className="sticky top-0 z-[1] bg-panel">{t("table.word")}</TableHead>
                  <TableHead className="sticky top-0 z-[1] bg-panel">{t("table.translation")}</TableHead>
                  <TableHead className="sticky top-0 z-[1] bg-panel" aria-hidden="true"></TableHead>
                  <TableHead className="sticky top-0 z-[1] bg-panel">{t("table.status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody id="wordRows" className="mobile:block">
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
              </TableBody>
            </Table>
          </div>
          <div
            id="wordPagination"
            className="word-pagination mt-3 flex items-center justify-center gap-3 text-body mobile:grid mobile:grid-cols-1 mobile:gap-2"
            hidden={displayMode !== "page" || !words.length}
          >
            <Button id="wordPrevPage" variant="secondary" className="mobile:h-11" disabled={wordRange.page <= 0} onClick={() => setPage(wordRange.page - 1)}>
              {t("collections.prevPage")}
            </Button>
            <span id="wordPageStatus" className="text-secondary mobile:text-center" role="status">
              {t("collections.pageStatus", { current: formatCount(wordRange.page + 1), total: formatCount(wordRange.totalPages) })}
            </span>
            <Button
              id="wordNextPage"
              variant="secondary"
              className="mobile:h-11"
              disabled={wordRange.page >= wordRange.totalPages - 1}
              onClick={() => setPage(wordRange.page + 1)}
            >
              {t("collections.nextPage")}
            </Button>
          </div>
          <p id="emptyState" className="mt-4 text-body text-secondary" hidden={!showEmptyState}>
            {t(hasCollections ? "collections.noSearchResults" : "collections.empty")}
          </p>
        </Card>
      </SidebarLayout>
      <UploadDialog open={uploadOpen} onOpenChange={setUploadOpen} languageId={languageId} collections={collections} onImported={handleImported} />
    </section>
  );
}

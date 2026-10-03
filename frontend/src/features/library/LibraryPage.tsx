/**
 * The Library route (/library, contract C2): the category sidebar beside a
 * searchable, scrollable list of works with import, rename, delete, move to
 * category and the dashboard go-to highlight. The selected category and the
 * search live in the address (?category=, ?q=); rows open /reader/:id.
 */

import { useCallback, useEffect, useRef, useState, type UIEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router";
import { AnimatePresence, useReducedMotion } from "motion/react";
import { PanelLeftOpenIcon } from "lucide-react";
import { useConfirm } from "@/components/app/ConfirmDialog";
import { FadeIn } from "@/components/app/FadeIn";
import { toast, toastError } from "@/components/app/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { libraryPath, parseLibraryAddress, readerPath } from "@/app/route-paths";
import {
  hasPendingWork,
  MATERIAL_LOAD_MORE_THRESHOLD_PX,
  MATERIAL_SEARCH_DEBOUNCE_MS,
  materialRowState,
  MaterialImportDialog,
  useDeleteMaterial,
  useRenameMaterial
} from "@/features/materials";
import { refreshStudyData } from "@/lib/api";
import type { LibraryCategory, MaterialListItem } from "@/lib/api/types";
import { useFormatCount, useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useAnimatedSidebar } from "@/lib/hooks/use-animated-sidebar";
import { useIsMobileLayout } from "@/lib/hooks/use-media-query";
import { useAssignCategory, useCategories, useLibraryMaterials } from "./data";
import { CategorySidebar, useCategoriesExpanded } from "./categories/CategorySidebar";
import { LibraryRow } from "./LibraryRow";
import { LIBRARY_FOCUS_OUTLINE_MS, LIBRARY_SIDEBAR_COLUMN_WIDTH } from "./library";
import "./library.css";

/** The Library route: category and search in the address, works listed with links into the Reader. */
export default function LibraryPage() {
  const t = useT();
  const formatCount = useFormatCount();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const [searchParams] = useSearchParams();
  const { category, q, focus } = parseLibraryAddress(searchParams);
  const [searchInput, setSearchInput] = useState(q);
  const [importOpen, setImportOpen] = useState(false);
  const isMobile = useIsMobileLayout();
  const [categoriesExpanded, setCategoriesExpanded] = useCategoriesExpanded();
  const layout = useRef<HTMLElement>(null);
  const sidebarColumn = useRef<HTMLDivElement>(null);
  const [renameId, setRenameId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [outlinedId, setOutlinedId] = useState<number | null>(null);
  const list = useRef<HTMLDivElement>(null);
  // The work a dashboard go-to is still bringing into view.
  const goToId = useRef<number | null>(null);
  const { materials, isSuccess, hasNextPage, isFetchingNextPage, fetchNextPage } = useLibraryMaterials({ category, search: q });
  const { categories } = useCategories();
  const { assign } = useAssignCategory();
  const renameMaterial = useRenameMaterial();
  const deleteMaterial = useDeleteMaterial();
  const pending = hasPendingWork(materials);
  const wasPending = useRef(false);

  // Slides the desktop category column open or closed: the grid takes the animated width through --libraryColumn (see library.css).
  useAnimatedSidebar({
    collapsed: !categoriesExpanded,
    enabled: !isMobile,
    restWidth: (collapsed) => (collapsed ? 0 : LIBRARY_SIDEBAR_COLUMN_WIDTH),
    sidebar: sidebarColumn,
    onFrame: (width) => {
      layout.current?.classList.toggle("is-sliding", width !== null);
      if (width === null) {
        layout.current?.style.removeProperty("--libraryColumn");
      } else {
        layout.current?.style.setProperty("--libraryColumn", `${width}px`);
      }
    }
  });

  const go = useCallback((address: { category: LibraryCategory; q: string }, replace = false) => navigate(libraryPath(address), { replace }), [navigate]);

  // Debounced search: the text goes into the address, which drives the query.
  useEffect(() => {
    if (searchInput === q) {
      return;
    }
    const id = window.setTimeout(() => go({ category, q: searchInput.trim() }, true), MATERIAL_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [searchInput, q, category, go]);

  // The dashboard go-to (?focus=): select All, clear the search, and drop focus from the address at once so a reload does not repeat it.
  useEffect(() => {
    if (focus !== undefined) {
      goToId.current = focus;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resets the typed search to match the address rewritten below
      setSearchInput("");
      go({ category: "all", q: "" }, true);
    }
  }, [focus, go]);

  // Bring the go-to work into view (paging in more works until it is found), then outline it for a moment.
  useEffect(() => {
    // Wait until the address has settled on All with no search (the go-to effect above rewrites it).
    if (goToId.current === null || !isSuccess || focus !== undefined || category !== "all" || q) {
      return;
    }
    const row = list.current?.querySelector(`[data-material-row="${goToId.current}"]`);
    if (row) {
      row.scrollIntoView({ block: "center", behavior: reduceMotion ? "auto" : "smooth" });
      setOutlinedId(goToId.current);
      goToId.current = null;
    } else if (hasNextPage) {
      if (!isFetchingNextPage) {
        void fetchNextPage();
      }
    } else {
      goToId.current = null;
    }
  }, [focus, category, q, isSuccess, materials, hasNextPage, isFetchingNextPage, fetchNextPage, reduceMotion]);

  useEffect(() => {
    if (outlinedId === null) {
      return;
    }
    const id = window.setTimeout(() => setOutlinedId(null), LIBRARY_FOCUS_OUTLINE_MS);
    return () => window.clearTimeout(id);
  }, [outlinedId]);

  // Imports and translations add words and change document stats: refresh once they settle.
  useEffect(() => {
    if (wasPending.current && !pending) {
      void refreshStudyData(queryClient);
    }
    wasPending.current = pending;
  }, [pending, queryClient]);

  function loadMoreOnScroll(event: UIEvent<HTMLDivElement>) {
    const el = event.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < MATERIAL_LOAD_MORE_THRESHOLD_PX && hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }

  function openMaterial(material: MaterialListItem) {
    if (materialRowState(material) === "translating") {
      toast.info(t("reader.translatingWait"));
      return;
    }
    navigate(readerPath(material.id));
  }

  async function saveRename(material: MaterialListItem, input: HTMLInputElement) {
    if (renameMaterial.isPending) {
      return;
    }
    const title = input.value.trim();
    if (!title) {
      toast.error(t("reader.renameMaterialRequired"));
      input.focus();
      return;
    }
    if (title === material.title) {
      setRenameId(null);
      return;
    }
    try {
      await renameMaterial.mutateAsync({ materialId: material.id, title });
      setRenameId(null);
      toast.success(t("reader.renamedMaterial"));
    } catch (error) {
      toastError(error);
      input.focus();
    }
  }

  async function removeMaterial(material: MaterialListItem) {
    const confirmed = await confirm({
      title: t("reader.deleteMaterialConfirm", { title: material.title }),
      confirmLabel: t("common.delete"),
      destructive: true
    });
    if (!confirmed) {
      return;
    }
    setDeletingId(material.id);
    try {
      await deleteMaterial.mutateAsync(material.id);
      toast.success(t("reader.deletedMaterial"));
    } catch (error) {
      toastError(error);
    } finally {
      setDeletingId(null);
    }
  }

  async function moveMaterial(material: MaterialListItem, categoryId: number | null) {
    try {
      await assign(material.id, categoryId);
    } catch (error) {
      toastError(error);
    }
  }

  let emptyKey = "";
  if (isSuccess && !materials.length) {
    emptyKey = q ? "reader.noSearchMatches" : category === "all" ? "reader.noMaterials" : "library.emptyCategory";
  }

  return (
    <section id="libraryView" ref={layout} className={cn("library-layout", !categoriesExpanded && "is-collapsed")}>
      <div ref={sidebarColumn} className="library-sidebar-column">
        <CategorySidebar
          selected={category}
          expanded={categoriesExpanded}
          onExpandedChange={setCategoriesExpanded}
          onSelect={(next) => go({ category: next, q })}
        />
      </div>
      <FadeIn className="min-w-0 rounded-lg border border-line bg-panel p-5 shadow-panel mobile:p-3">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className={cn("size-11 shrink-0 border-line bg-panel text-brand mobile:hidden", categoriesExpanded && "hidden")}
            aria-label={t("library.categories.open")}
            title={t("library.categories.open")}
            onClick={() => setCategoriesExpanded(true)}
          >
            <PanelLeftOpenIcon aria-hidden="true" />
          </Button>
          <Input
            id="materialSearch"
            className="h-auto min-h-11 min-w-0 flex-1 mobile:basis-full border-line bg-panel px-3 py-2 text-sm text-main md:text-sm"
            type="search"
            autoComplete="off"
            placeholder={t("reader.searchPlaceholder")}
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
          {/* Reserved for the future filter and display buttons. */}
          <div id="libraryHeaderSlots" className="flex shrink-0 items-center gap-2 mobile:flex-1" aria-hidden="true">
            <span data-slot="filter" className="size-11 rounded-md bg-muted/60" />
            <span data-slot="display" className="size-11 rounded-md bg-muted/60" />
          </div>
          <Button id="materialImportOpen" className="min-h-11 shrink-0 px-4 text-white" type="button" onClick={() => setImportOpen(true)}>
            {t("reader.importButton")}
          </Button>
        </div>
        <div id="materialList" ref={list} className="grid max-h-[calc(100vh-220px)] gap-2 overflow-auto" onScroll={loadMoreOnScroll}>
          <AnimatePresence initial={false}>
            {materials.map((material) => (
              <LibraryRow
                key={material.id}
                material={material}
                categories={categories}
                focused={material.id === outlinedId}
                renaming={material.id === renameId}
                deleting={material.id === deletingId}
                wordCount={formatCount(material.wordCount)}
                onOpen={() => openMaterial(material)}
                onStartRename={() => setRenameId(material.id)}
                onCancelRename={() => setRenameId(null)}
                onSaveRename={(input) => saveRename(material, input)}
                onDelete={() => void removeMaterial(material)}
                onMove={(categoryId) => void moveMaterial(material, categoryId)}
              />
            ))}
          </AnimatePresence>
          {emptyKey ? <p className="empty py-6 text-center text-secondary">{t(emptyKey)}</p> : null}
        </div>
        <MaterialImportDialog open={importOpen} onOpenChange={setImportOpen} />
      </FadeIn>
    </section>
  );
}

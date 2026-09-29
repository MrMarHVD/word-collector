import { useEffect, useRef, useState, type FormEvent, type UIEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useConfirm } from "@/components/app/ConfirmDialog";
import { toast, toastError } from "@/components/app/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { refreshStudyData } from "@/lib/api";
import type { MaterialListItem } from "@/lib/api/types";
import { useFormatCount, useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { MaterialImportDialog } from "./MaterialImportDialog";
import { hasPendingWork, importProgress, MATERIAL_LOAD_MORE_THRESHOLD_PX, MATERIAL_SEARCH_DEBOUNCE_MS, materialRowState } from "./materials";
import { useDeleteMaterial, useMaterialsList, useRenameMaterial } from "./use-materials";
import "./materials.css";

export interface MaterialListProps {
  /** Material currently open in the reader (highlighted), or null. */
  selectedMaterialId: number | null;
  /**
   * Open a material in the reader: called when the user picks a ready
   * material, and when a material imported from this list finishes importing
   * and translating (the legacy auto-open).
   */
  onOpenMaterial: (material: MaterialListItem) => void;
  /** Called after a material is deleted, so the reader can close it if it was open. */
  onMaterialDeleted?: (materialId: number) => void;
}

/**
 * The reader's documents-tab body: import button (#materialImportOpen,
 * opening MaterialImportDialog), search (#materialSearch) and the paginated
 * list (#materialList) with rename, delete and import/translation progress.
 * While any material is importing or translating the list polls; when that
 * work settles, study data (dashboard, words, reader pages) is refreshed.
 */
export function MaterialList({ selectedMaterialId, onOpenMaterial, onMaterialDeleted }: MaterialListProps) {
  const t = useT();
  const formatCount = useFormatCount();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [importOpen, setImportOpen] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [renameId, setRenameId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const { materials, isSuccess, hasNextPage, isFetchingNextPage, fetchNextPage } = useMaterialsList(search);
  const renameMaterial = useRenameMaterial();
  const deleteMaterial = useDeleteMaterial();
  const pending = hasPendingWork(materials);
  const wasPending = useRef(false);
  const importingId = useRef<number | null>(null);

  useEffect(() => {
    const id = window.setTimeout(() => setSearch(searchInput), MATERIAL_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [searchInput]);

  // Imports and translations add words and change document stats: refresh once they settle.
  useEffect(() => {
    if (wasPending.current && !pending) {
      void refreshStudyData(queryClient);
    }
    wasPending.current = pending;
  }, [pending, queryClient]);

  // Open the work being imported as soon as it becomes openable.
  useEffect(() => {
    const tracked = importingId.current === null ? null : materials.find((material) => material.id === importingId.current);
    if (tracked && materialRowState(tracked) === "ready") {
      importingId.current = null;
      onOpenMaterial(tracked);
    }
  }, [materials, onOpenMaterial]);

  function loadMoreOnScroll(event: UIEvent<HTMLDivElement>) {
    const list = event.currentTarget;
    if (list.scrollHeight - list.scrollTop - list.clientHeight < MATERIAL_LOAD_MORE_THRESHOLD_PX && hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }

  function openMaterial(material: MaterialListItem) {
    if (materialRowState(material) === "translating") {
      toast.info(t("reader.translatingWait"));
      return;
    }
    onOpenMaterial(material);
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
      onMaterialDeleted?.(material.id);
    } catch (error) {
      toastError(error);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <Button id="materialImportOpen" className="mb-3 min-h-11 w-full px-4 text-white" type="button" onClick={() => setImportOpen(true)}>
        {t("reader.importButton")}
      </Button>
      <Input
        id="materialSearch"
        className="mb-3 h-auto min-h-11 border-line bg-panel px-3 py-2 text-sm text-main md:text-sm"
        type="search"
        autoComplete="off"
        placeholder={t("reader.searchPlaceholder")}
        value={searchInput}
        onChange={(event) => setSearchInput(event.target.value)}
      />
      <div id="materialList" className="material-list grid max-h-[calc(100vh-260px)] gap-2 overflow-auto" onScroll={loadMoreOnScroll}>
        {materials.map((material) => (
          <MaterialRow
            key={material.id}
            material={material}
            active={material.id === selectedMaterialId}
            renaming={material.id === renameId}
            deleting={material.id === deletingId}
            wordCount={formatCount(material.wordCount)}
            onOpen={() => openMaterial(material)}
            onStartRename={() => setRenameId(material.id)}
            onCancelRename={() => setRenameId(null)}
            onSaveRename={(input) => saveRename(material, input)}
            onDelete={() => void removeMaterial(material)}
          />
        ))}
        {isSuccess && !materials.length ? <p className="empty text-secondary">{t(search.trim() ? "reader.noSearchMatches" : "reader.noMaterials")}</p> : null}
      </div>
      <MaterialImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImportStarted={(material) => {
          importingId.current = material.id;
        }}
      />
    </>
  );
}

interface MaterialRowProps {
  material: MaterialListItem;
  active: boolean;
  renaming: boolean;
  deleting: boolean;
  /** Localised word count for the meta line. */
  wordCount: string;
  onOpen: () => void;
  onStartRename: () => void;
  onCancelRename: () => void;
  onSaveRename: (input: HTMLInputElement) => void;
  onDelete: () => void;
}

/** One `.material-row`: title button or inline rename form, status meta, progress bar and the rename/delete actions. */
function MaterialRow({ material, active, renaming, deleting, wordCount, onOpen, onStartRename, onCancelRename, onSaveRename, onDelete }: MaterialRowProps) {
  const t = useT();
  const state = materialRowState(material);
  const cancelled = useRef(false);
  const renameInput = useRef<HTMLInputElement>(null);
  let meta = t("reader.materialMeta", { words: wordCount, type: material.fileType.toUpperCase() });
  if (state === "importing") {
    meta = t("reader.importingMaterial");
  } else if (state === "failed") {
    meta = material.importError || t("reader.importFailed");
  } else if (state === "translating") {
    meta = t("reader.translatingWait");
  }

  useEffect(() => {
    if (renaming) {
      cancelled.current = false;
      renameInput.current?.focus();
      renameInput.current?.select();
    }
  }, [renaming]);

  function submitRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = event.currentTarget.elements.namedItem("title");
    if (input instanceof HTMLInputElement) {
      onSaveRename(input);
    }
  }

  return (
    <div className={cn("material-row", active && "is-active")}>
      <div className="material-card">
        <div className="material-main">
          {renaming ? (
            <form className="material-title-form" data-rename-material-form={material.id} onSubmit={submitRename}>
              <input
                className="material-title-input"
                name="title"
                defaultValue={material.title}
                aria-label={t("reader.renameMaterialInput")}
                autoComplete="off"
                ref={renameInput}
                onBlur={(event) => {
                  if (!cancelled.current) {
                    onSaveRename(event.currentTarget);
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    cancelled.current = true;
                    onCancelRename();
                  }
                }}
              />
            </form>
          ) : (
            <button className="material-title-button" type="button" data-material-id={material.id} disabled={state !== "ready"} onClick={onOpen}>
              {material.title}
            </button>
          )}
          <small>{meta}</small>
          {state === "importing" ? <MaterialProgress material={material} /> : null}
        </div>
        <div className="material-actions">
          <button
            className="material-icon-button material-rename-button"
            type="button"
            data-rename-material-id={material.id}
            aria-label={t("reader.renameMaterial")}
            title={t("reader.renameMaterial")}
            onClick={onStartRename}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="material-action-icon">
              <path d="M4 20h4l11-11a2.8 2.8 0 0 0-4-4L4 16v4Z" />
              <path d="M13.5 6.5l4 4" />
            </svg>
          </button>
          <button
            className="material-icon-button material-delete-button"
            type="button"
            data-delete-material-id={material.id}
            aria-label={t("reader.deleteMaterial")}
            title={t("reader.deleteMaterial")}
            disabled={deleting}
            onClick={onDelete}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="material-action-icon">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

/** Per-row import progress bar (determinate once the word total is known). */
function MaterialProgress({ material }: { material: MaterialListItem }) {
  const t = useT();
  const progress = importProgress(material);
  return (
    <div
      className="material-progress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={progress.determinate ? progress.percent : undefined}
    >
      <div className="material-progress-track">
        <div className={cn("material-progress-bar", !progress.determinate && "animate-pulse")} style={{ width: `${progress.percent}%` }} />
      </div>
      <small>{progress.determinate ? t("reader.translationProgress", { percent: String(progress.percent) }) : t("reader.preparing")}</small>
    </div>
  );
}

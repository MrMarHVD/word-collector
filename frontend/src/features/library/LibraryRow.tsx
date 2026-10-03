/**
 * One work in the Library list: letter placeholder, title (or inline rename),
 * meta line, progress bar and the ⋯ menu (rename, move to category, delete).
 * The row is a ListRow (the draggable part, as `m.*` swallows onDragStart) inside a `.material-row` fade wrapper, and a drag source for the category sidebar's drop targets (contract C4).
 */

import { useEffect, useRef, type DragEvent, type FormEvent } from "react";
import { m } from "motion/react";
import { EllipsisIcon, FolderInputIcon, PencilIcon, Trash2Icon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { ListRow } from "@/components/app/ListRow";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { importProgress, materialRowState } from "@/features/materials";
import type { Category, MaterialListItem } from "@/lib/api/types";
import { useT } from "@/lib/i18n";
import { MOTION_FADE, MOTION_FADE_FAST } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { firstGrapheme, MATERIAL_DRAG_TYPE, readingPercent } from "./library";

export interface LibraryRowProps {
  material: MaterialListItem;
  /** The user's categories, for the "Move to category" submenu. */
  categories: Category[];
  /** Highlighted (selected state) as the dashboard go-to target. */
  focused: boolean;
  renaming: boolean;
  deleting: boolean;
  /** Localised word count for the meta line. */
  wordCount: string;
  onOpen: () => void;
  onStartRename: () => void;
  onCancelRename: () => void;
  onSaveRename: (input: HTMLInputElement) => void;
  onDelete: () => void;
  onMove: (categoryId: number | null) => void;
}

/**
 * A `.material-row` (hook kept from the old list): fades in when added and out when removed, the exiting row inert.
 * The draggable part is a plain element because `m.*` swallows onDragStart.
 */
export function LibraryRow({
  material,
  categories,
  focused,
  renaming,
  deleting,
  wordCount,
  onOpen,
  onStartRename,
  onCancelRename,
  onSaveRename,
  onDelete,
  onMove
}: LibraryRowProps) {
  const t = useT();
  const state = materialRowState(material);
  const cancelled = useRef(false);
  const renameInput = useRef<HTMLInputElement>(null);
  const renameRequested = useRef(false);
  let meta = t("reader.materialMeta", { words: wordCount, type: material.fileType.toUpperCase() });
  if (state === "importing") {
    meta = t("reader.importingMaterial");
  } else if (state === "failed") {
    meta = material.importError || t("reader.importFailed");
  } else if (state === "translating") {
    meta = t("reader.translatingWait");
  }
  const importing = state === "importing" ? importProgress(material) : null;
  const percent = readingPercent(material.readTokens, material.totalTokens);

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

  const title = renaming ? (
    <form data-rename-material-form={material.id} onSubmit={submitRename}>
      <Input
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
    <Button
      variant="ghost"
      className="h-auto max-w-full min-w-0 justify-start px-0 py-0 hover:bg-transparent hover:text-brand"
      data-material-id={material.id}
      disabled={state !== "ready"}
      onClick={onOpen}
    >
      <span className="truncate">{material.title}</span>
    </Button>
  );

  return (
    <m.div
      className="material-row min-w-0 border-b border-line last:border-b-0"
      data-material-row={material.id}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0, transition: MOTION_FADE }}
      exit={{ opacity: 0, height: 0, overflow: "hidden", pointerEvents: "none", transition: MOTION_FADE_FAST }}
    >
      <ListRow
        className="border-b-0"
        selected={focused}
        draggable={!renaming}
        onDragStart={(event: DragEvent) => {
          event.dataTransfer.setData(MATERIAL_DRAG_TYPE, String(material.id));
          event.dataTransfer.effectAllowed = "move";
        }}
        leading={
          <span className="grid size-10 place-items-center rounded-control bg-subtle text-heading text-secondary" aria-hidden="true">
            {firstGrapheme(material.title)}
          </span>
        }
        title={title}
        meta={
          <>
            <span className="block truncate">{meta}</span>
            {state === "ready" || importing ? (
              <div
                className="mt-1 h-1.5 overflow-hidden rounded-control bg-muted"
                role="progressbar"
                aria-label={t(importing ? "reader.importingMaterial" : "library.row.readingProgress")}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={importing ? (importing.determinate ? importing.percent : undefined) : percent}
              >
                <div
                  className={cn("h-full rounded-control bg-primary transition-[width] duration-500", importing && !importing.determinate && "animate-pulse")}
                  style={{ width: `${importing ? importing.percent : percent}%` }}
                />
              </div>
            ) : null}
          </>
        }
        actions={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton data-material-menu-id={material.id} aria-label={t("library.row.menu")} title={t("library.row.menu")}>
                <EllipsisIcon aria-hidden="true" />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              onCloseAutoFocus={(event) => {
                // Hand the focus to the rename input instead of returning it to the ⋯ button.
                if (renameRequested.current) {
                  renameRequested.current = false;
                  event.preventDefault();
                  renameInput.current?.focus();
                  renameInput.current?.select();
                }
              }}
            >
              <DropdownMenuItem
                data-rename-material-id={material.id}
                onSelect={() => {
                  renameRequested.current = true;
                  onStartRename();
                }}
              >
                <PencilIcon aria-hidden="true" />
                {t("reader.renameMaterial")}
              </DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger data-move-material-id={material.id}>
                  <FolderInputIcon aria-hidden="true" />
                  {t("library.row.moveToCategory")}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuRadioGroup
                    value={String(material.categoryId ?? "uncategorised")}
                    onValueChange={(value) => onMove(value === "uncategorised" ? null : Number(value))}
                  >
                    <DropdownMenuRadioItem value="uncategorised" data-move-category="uncategorised">
                      {t("library.categories.uncategorised")}
                    </DropdownMenuRadioItem>
                    {categories.map((category) => (
                      <DropdownMenuRadioItem key={category.id} value={String(category.id)} data-move-category={category.id}>
                        {category.name}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" data-delete-material-id={material.id} disabled={deleting} onSelect={onDelete}>
                <Trash2Icon aria-hidden="true" />
                {t("reader.deleteMaterial")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />
    </m.div>
  );
}

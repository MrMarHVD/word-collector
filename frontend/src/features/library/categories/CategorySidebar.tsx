/**
 * Category sidebar (contract C4): the permanent All and Uncategorised items
 * plus the user's categories with counts. Categories can be created, renamed
 * inline, reordered (drag or Move up/down) and deleted; All is not a drop
 * target, other items accept dragged works. Collapsible, expanded on first
 * visit and remembered.
 */

import { ChevronDownIcon, ChevronRightIcon, EllipsisIcon, PlusIcon } from "lucide-react";
import { useRef, useState, type DragEvent } from "react";
import { useConfirm } from "@/components/app/ConfirmDialog";
import { toastError } from "@/components/app/toast";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useAssignCategory, useCategories, useCategoryMutations } from "@/features/library/data";
import { moveCategoryTo } from "@/features/library/data/library-cache";
import { usePersistentState } from "@/lib/hooks/use-persistent-state";
import type { Category, LibraryCategory } from "@/lib/api/types";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** Drag data type set by the Library's work rows (contract C4). */
const MATERIAL_DRAG_TYPE = "application/x-word-marker-material";
/** Drag data type for reordering the sidebar's own categories. */
const CATEGORY_DRAG_TYPE = "application/x-word-marker-category";
const EXPANDED_KEY = "wordMarkerLibraryCategoriesExpanded";
const MAX_NAME_LENGTH = 60;

export interface CategorySidebarProps {
  /** The category whose works the Library shows. */
  selected: LibraryCategory;
  /** Called when the user picks a category. */
  onSelect: (category: LibraryCategory) => void;
  /** Controls the expanded state; when omitted the sidebar keeps its own persisted state. Collapsed and controlled, it renders nothing on desktop (the page shows the re-open button). */
  expanded?: boolean;
  /** Called when the user toggles the sidebar's own header control (mobile when controlled). */
  onExpandedChange?: (expanded: boolean) => void;
}

const parseExpanded = (stored: string | null) => stored !== "false";

/** The persisted expanded state of the category sidebar (default expanded on first visit), for a page that owns it and passes it back as `expanded`. */
export function useCategoriesExpanded(): [boolean, (expanded: boolean) => void] {
  return usePersistentState(EXPANDED_KEY, parseExpanded);
}

/** Inline name field for creating or renaming a category; Enter saves, Escape or blur cancels. */
function NameInput({ initial, onSubmit, onCancel }: { initial: string; onSubmit: (name: string) => Promise<void>; onCancel: () => void }) {
  const t = useT();
  const [value, setValue] = useState(initial);
  const busy = useRef(false);
  const submit = async () => {
    const name = value.trim();
    if (busy.current) {
      return;
    }
    if (!name || name === initial) {
      onCancel();
      return;
    }
    busy.current = true;
    try {
      await onSubmit(name);
    } catch (error) {
      toastError(error);
      busy.current = false;
    }
  };
  return (
    <Input
      autoFocus
      value={value}
      maxLength={MAX_NAME_LENGTH}
      aria-label={t("library.categories.nameLabel")}
      placeholder={t("library.categories.namePlaceholder")}
      className="h-9"
      onChange={(event) => setValue(event.target.value)}
      onFocus={(event) => event.target.select()}
      onBlur={() => !busy.current && onCancel()}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          void submit();
        } else if (event.key === "Escape") {
          onCancel();
        }
      }}
    />
  );
}

/** The library's category list (#libraryCategories); each item carries data-category="all" | "uncategorised" | "<id>". */
export function CategorySidebar({ selected, onSelect, expanded: controlledExpanded, onExpandedChange }: CategorySidebarProps) {
  const t = useT();
  const confirm = useConfirm();
  const { categories, totalCount, uncategorisedCount } = useCategories();
  const { create, rename, reorder, remove } = useCategoryMutations();
  const { assign } = useAssignCategory();
  const [storedExpanded, setStoredExpanded] = useCategoriesExpanded();
  const controlled = controlledExpanded !== undefined;
  const expanded = controlledExpanded ?? storedExpanded;
  const setExpanded = (next: boolean) => {
    if (!controlled) {
      setStoredExpanded(next);
    }
    onExpandedChange?.(next);
  };
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [dropKey, setDropKey] = useState<string | null>(null);
  const dragged = useRef<number | null>(null);

  const move = (id: number, delta: number) => {
    const ids = categories.map((category) => category.id);
    const from = ids.indexOf(id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= ids.length) {
      return;
    }
    ids.splice(to, 0, ...ids.splice(from, 1));
    reorder(ids).catch(toastError);
  };

  const handleDelete = async (category: Category) => {
    const confirmed = await confirm({
      title: t("library.categories.deleteTitle", { name: category.name }),
      description: t("library.categories.deleteDescription"),
      confirmLabel: t("common.delete"),
      destructive: true
    });
    if (!confirmed) {
      return;
    }
    try {
      await remove(category.id);
      if (selected === category.id) {
        onSelect("all");
      }
    } catch (error) {
      toastError(error);
    }
  };

  const acceptsDrop = (event: DragEvent, category: Category | "uncategorised") => {
    const types = Array.from(event.dataTransfer.types);
    return (
      types.includes(MATERIAL_DRAG_TYPE) ||
      (category !== "uncategorised" && dragged.current !== null && dragged.current !== category.id && types.includes(CATEGORY_DRAG_TYPE))
    );
  };

  /** Drop handlers for an item; they read only the drag data types, never the source markup. */
  const dropProps = (key: string, target: Category | "uncategorised") => ({
    onDragOver: (event: DragEvent) => {
      if (acceptsDrop(event, target)) {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setDropKey(key);
      }
    },
    onDragLeave: (event: DragEvent) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
        setDropKey((current) => (current === key ? null : current));
      }
    },
    onDrop: (event: DragEvent) => {
      setDropKey(null);
      const materialId = Number(event.dataTransfer.getData(MATERIAL_DRAG_TYPE));
      if (materialId) {
        event.preventDefault();
        assign(materialId, target === "uncategorised" ? null : target.id).catch(toastError);
      } else if (target !== "uncategorised" && dragged.current !== null) {
        event.preventDefault();
        reorder(
          moveCategoryTo(
            categories.map((category) => category.id),
            dragged.current,
            target.id
          )
        ).catch(toastError);
      }
      dragged.current = null;
    }
  });

  const itemClass = (active: boolean, key: string) =>
    cn(
      "flex min-h-11 items-center gap-1 rounded-md pl-3 text-sm font-semibold text-secondary transition-colors hover:bg-muted",
      active && "bg-muted text-brand",
      dropKey === key && "bg-brand/10 outline-2 -outline-offset-2 outline-brand"
    );

  const fixedItem = (category: "all" | "uncategorised", label: string, count: number) => (
    <div
      key={category}
      data-category={category}
      className={itemClass(selected === category, category)}
      {...(category === "uncategorised" ? dropProps("uncategorised", "uncategorised") : {})}
    >
      <button
        type="button"
        aria-pressed={selected === category}
        className="flex min-h-11 flex-1 items-center justify-between gap-2 pr-3 text-left"
        onClick={() => onSelect(category)}
      >
        <span className="truncate">{label}</span>
        <span className="text-xs font-medium text-muted-foreground">{count}</span>
      </button>
    </div>
  );

  return (
    <aside
      id="libraryCategories"
      className={cn("library-categories grid content-start gap-1", controlled && !expanded && "hidden mobile:grid")}
      aria-label={t("library.categories.label")}
    >
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          aria-expanded={expanded}
          className="flex min-h-11 items-center gap-1 rounded-md px-1 text-xs font-bold uppercase tracking-wide text-muted-foreground hover:text-foreground"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <ChevronDownIcon className="size-4" aria-hidden /> : <ChevronRightIcon className="size-4" aria-hidden />}
          {t("library.categories.label")}
        </button>
        {expanded ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("library.categories.new")}
            title={t("library.categories.new")}
            onClick={() => setEditing("new")}
          >
            <PlusIcon aria-hidden />
          </Button>
        ) : null}
      </div>
      {expanded ? (
        <div className="grid gap-1">
          {fixedItem("all", t("library.categories.all"), totalCount)}
          {fixedItem("uncategorised", t("library.categories.uncategorised"), uncategorisedCount)}
          {categories.map((category, index) => {
            const key = String(category.id);
            return editing === category.id ? (
              <NameInput
                key={category.id}
                initial={category.name}
                onSubmit={async (name) => {
                  await rename(category.id, name);
                  setEditing(null);
                }}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <div
                key={category.id}
                data-category={key}
                draggable
                className={itemClass(selected === category.id, key)}
                onDragStart={(event) => {
                  dragged.current = category.id;
                  event.dataTransfer.setData(CATEGORY_DRAG_TYPE, key);
                  event.dataTransfer.effectAllowed = "move";
                }}
                onDragEnd={() => {
                  dragged.current = null;
                  setDropKey(null);
                }}
                {...dropProps(key, category)}
              >
                <button
                  type="button"
                  aria-pressed={selected === category.id}
                  className="flex min-h-11 flex-1 items-center justify-between gap-2 text-left"
                  onClick={() => onSelect(category.id)}
                >
                  <span className="truncate">{category.name}</span>
                  <span className="text-xs font-medium text-muted-foreground">{category.materialCount}</span>
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="ghost" size="icon-sm" aria-label={t("library.categories.actions", { name: category.name })}>
                      <EllipsisIcon aria-hidden />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setEditing(category.id)}>{t("common.rename")}</DropdownMenuItem>
                    <DropdownMenuItem disabled={index === 0} onSelect={() => move(category.id, -1)}>
                      {t("library.categories.moveUp")}
                    </DropdownMenuItem>
                    <DropdownMenuItem disabled={index === categories.length - 1} onSelect={() => move(category.id, 1)}>
                      {t("library.categories.moveDown")}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onSelect={() => void handleDelete(category)}>
                      {t("common.delete")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          })}
          {editing === "new" ? (
            <NameInput
              initial=""
              onSubmit={async (name) => {
                await create(name);
                setEditing(null);
              }}
              onCancel={() => setEditing(null)}
            />
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}

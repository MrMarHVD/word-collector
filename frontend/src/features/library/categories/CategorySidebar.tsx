/**
 * Category sidebar (contract C4). Stub from LIB-002: shows the permanent All
 * and Uncategorised items and reports the selection; LIB-004 owns the real
 * sidebar (user categories, drop targets, management).
 */

import type { LibraryCategory } from "@/lib/api/types";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export interface CategorySidebarProps {
  /** The category whose works the Library shows. */
  selected: LibraryCategory;
  /** Called when the user picks a category. */
  onSelect: (category: LibraryCategory) => void;
}

/** The Library's category list (#libraryCategories); each item carries data-category="all" | "uncategorised" | "<id>". */
export function CategorySidebar({ selected, onSelect }: CategorySidebarProps) {
  const t = useT();
  const items: { category: LibraryCategory; labelKey: string }[] = [
    { category: "all", labelKey: "library.categories.all" },
    { category: "uncategorised", labelKey: "library.categories.uncategorised" }
  ];
  return (
    <aside id="libraryCategories" className="library-categories grid content-start gap-1" aria-label={t("library.categories.label")}>
      {items.map(({ category, labelKey }) => (
        <button
          key={category}
          type="button"
          data-category={String(category)}
          aria-pressed={selected === category}
          className={cn("rounded-md px-3 py-2 text-left text-sm font-semibold text-secondary", selected === category && "bg-muted text-brand")}
          onClick={() => onSelect(category)}
        >
          {t(labelKey)}
        </button>
      ))}
    </aside>
  );
}

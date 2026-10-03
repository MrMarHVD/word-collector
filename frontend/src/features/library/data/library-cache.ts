/**
 * Pure cache transforms behind the Library's optimistic category assignment:
 * moving a work between categories in the cached lists and category counts.
 */

import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/api/query-keys";
import type { CategoriesResponse, Category, LibraryCategory, MaterialsResponse } from "@/lib/api/types";

export type LibraryPages = InfiniteData<MaterialsResponse, number>;

/** True when a work with `categoryId` belongs in the list filtered by `filter`. */
export function categoryMatches(filter: LibraryCategory, categoryId: number | null): boolean {
  if (filter === "all") {
    return true;
  }
  return filter === "uncategorised" ? categoryId === null : filter === categoryId;
}

/** The category a work currently has in the cached lists (null = uncategorised), or undefined when no list holds it. */
export function findCachedCategoryId(lists: (LibraryPages | undefined)[], materialId: number): number | null | undefined {
  for (const list of lists) {
    const found = list?.pages.flatMap((page) => page.materials).find((material) => material.id === materialId);
    if (found) {
      return found.categoryId;
    }
  }
  return undefined;
}

/** Applies a move to one cached list: the work gets its new category, or leaves the list when `filter` no longer matches it. */
export function assignInPages(data: LibraryPages, materialId: number, categoryId: number | null, filter: LibraryCategory): LibraryPages {
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      materials: page.materials.flatMap((material) => {
        if (material.id !== materialId) {
          return [material];
        }
        return categoryMatches(filter, categoryId) ? [{ ...material, categoryId }] : [];
      })
    }))
  };
}

/** Moves one work between category counts; `previous`/`next` are category ids, null meaning uncategorised. */
export function assignInCounts(counts: CategoriesResponse, previous: number | null, next: number | null): CategoriesResponse {
  if (previous === next) {
    return counts;
  }
  const shift =
    (id: number | null, delta: number) =>
    (entry: Category): Category =>
      entry.id === id ? { ...entry, materialCount: entry.materialCount + delta } : entry;
  return {
    ...counts,
    categories: counts.categories.map(shift(previous, -1)).map(shift(next, 1)),
    uncategorisedCount: counts.uncategorisedCount + (next === null ? 1 : 0) - (previous === null ? 1 : 0)
  };
}

/** The cached category lists of one study language; other languages' lists are left alone. */
export function categoryCountsFor(client: QueryClient, languageId: number | null): [readonly unknown[], CategoriesResponse | undefined][] {
  return client.getQueriesData<CategoriesResponse>({ queryKey: queryKeys.categories.list(languageId) });
}

/** Moves the category `draggedId` next to `targetId`: after it when it started above, before it otherwise. */
export function moveCategoryTo(ids: number[], draggedId: number, targetId: number): number[] {
  const from = ids.indexOf(draggedId);
  const rest = ids.filter((id) => id !== draggedId);
  const to = rest.indexOf(targetId);
  if (from < 0 || to < 0) {
    return ids;
  }
  rest.splice(from < ids.indexOf(targetId) ? to + 1 : to, 0, draggedId);
  return rest;
}

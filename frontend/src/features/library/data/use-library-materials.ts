/**
 * TanStack Query hook for the Library's work list (contract C3): the study
 * language's works filtered by category and title search, 50 per page, polling
 * while any work is importing or translating.
 */

import { infiniteQueryOptions, useInfiniteQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { flattenMaterials, hasPendingWork, MATERIAL_POLL_INTERVAL_MS } from "@/features/materials";
import { api, queryKeys, type LibraryCategory } from "@/lib/api";
import { useStudyLanguageStore } from "@/stores/study-language";

export interface LibraryMaterialsFilter {
  category: LibraryCategory;
  /** Title search; trimmed here, debounce it in the caller. */
  search: string;
}

/** GET /api/materials for one category and search, offset-paged; polls every 1.5 s while any loaded work has pending import or translation. */
export function libraryMaterialsQuery(languageId: number | null, { category, search }: LibraryMaterialsFilter) {
  const trimmed = search.trim();
  return infiniteQueryOptions({
    queryKey: queryKeys.library.materials(languageId, category, trimmed),
    queryFn: ({ pageParam }) => api.materials.list({ languageId: languageId as number, offset: pageParam, search: trimmed, category }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) =>
      lastPage.materials.length === lastPage.pageSize ? pages.reduce((count, page) => count + page.materials.length, 0) : undefined,
    enabled: languageId !== null,
    refetchInterval: (query) => (hasPendingWork(flattenMaterials(query.state.data)) ? MATERIAL_POLL_INTERVAL_MS : false)
  });
}

/** The selected study language's works in `category` matching `search`, with infinite-scroll paging; `materials` is every loaded work in order. */
export function useLibraryMaterials(filter: LibraryMaterialsFilter) {
  const languageId = useStudyLanguageStore((state) => state.selectedId);
  const query = useInfiniteQuery(libraryMaterialsQuery(languageId, filter));
  const materials = useMemo(() => flattenMaterials(query.data), [query.data]);
  return { ...query, materials };
}

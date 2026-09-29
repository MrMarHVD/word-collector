import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { api, queryKeys } from "@/lib/api";
import { DOCUMENT_STATS_PAGE_SIZE, nextDocumentsOffset } from "./progress";

/**
 * Paginated per-document progress (GET /api/dashboard/documents) for the
 * documents stats tab. `search` must already be debounced and trimmed. The
 * previous result stays visible while a new search loads, as in the legacy
 * view, which only re-rendered once the request finished.
 */
export function useDashboardDocuments(languageId: number | null, search: string, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: queryKeys.dashboard.documents(languageId, search),
    queryFn: ({ pageParam }) => api.dashboard.documents({ languageId, search, limit: DOCUMENT_STATS_PAGE_SIZE, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (_lastPage, pages) => nextDocumentsOffset(pages),
    enabled: enabled && languageId !== null,
    placeholderData: keepPreviousData
  });
}

/**
 * TanStack Query hooks for the admin panels. The paged lists drop their cache
 * once unobserved (`gcTime: 0`), so every panel entry starts again from the
 * first page, as the legacy panels did.
 */

import { keepPreviousData, useInfiniteQuery, useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { api, queryKeys, type AdminUsersParams, type AdminUsersResponse, type AdminWordsParams, type AdminWordsResponse } from "@/lib/api";

/** Server page size of the words list (legacy PAGE_SIZE). */
export const ADMIN_WORDS_PAGE_SIZE = 50;

type UsersFilters = Omit<AdminUsersParams, "cursorValue" | "cursorId">;
type WordsFilters = Omit<AdminWordsParams, "cursor">;

/** Keyset-paged users list; keeps the previous rows on screen while new filters load. */
export function useAdminUsers(filters: UsersFilters) {
  return useInfiniteQuery({
    queryKey: queryKeys.admin.users(filters),
    queryFn: ({ pageParam }) => api.admin.listUsers({ ...filters, cursorValue: pageParam?.value, cursorId: pageParam?.id }),
    initialPageParam: null as AdminUsersResponse["nextCursor"],
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
    gcTime: 0
  });
}

/** Saves a user's limit overrides and patches the row in the cached list from the response. */
export function useSaveUserLimits(filters: UsersFilters) {
  const queryClient = useQueryClient();
  return async (userId: number, body: Parameters<typeof api.admin.setUserLimits>[1]) => {
    const result = await api.admin.setUserLimits(userId, body);
    queryClient.setQueryData<InfiniteData<AdminUsersResponse>>(queryKeys.admin.users(filters), (data) =>
      data
        ? {
            ...data,
            pages: data.pages.map((page) => ({ ...page, users: page.users.map((row) => (row.id === userId ? { ...row, ...result.user } : row)) }))
          }
        : data
    );
  };
}

/** Source languages with words and the translation-language options. */
export function useAdminWordLanguages() {
  return useQuery({ queryKey: queryKeys.admin.wordLanguages, queryFn: () => api.admin.wordLanguages() });
}

/** Keyset-paged words of one source language with their canonical translation. */
export function useAdminWords(filters: WordsFilters) {
  return useInfiniteQuery({
    queryKey: queryKeys.admin.words(filters),
    queryFn: ({ pageParam }) => api.admin.listWords({ ...filters, cursor: pageParam ?? undefined }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    gcTime: 0
  });
}

/** Saves a canonical translation and writes the stored value into the cached list; resolves to that value. */
export function useSaveCanonicalTranslation(filters: WordsFilters) {
  const queryClient = useQueryClient();
  return async (wordId: number, translation: string): Promise<string> => {
    const result = await api.admin.setCanonicalTranslation(wordId, { native: filters.native, translation });
    const saved = result.word?.canonicalTranslation ?? translation;
    queryClient.setQueryData<InfiniteData<AdminWordsResponse>>(queryKeys.admin.words(filters), (data) =>
      data
        ? {
            ...data,
            pages: data.pages.map((page) => ({
              ...page,
              words: page.words.map((word) => (word.id === wordId ? { ...word, canonicalTranslation: saved } : word))
            }))
          }
        : data
    );
    return saved;
  };
}

/** One page of the admin audit log (superadmin only); the previous page stays on screen while the next loads. */
export function useAuditLog(page: number) {
  return useQuery({ queryKey: queryKeys.admin.audit(page), queryFn: () => api.admin.auditLog(page), placeholderData: keepPreviousData });
}

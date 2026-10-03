/**
 * TanStack Query hooks for the Library's categories (contract C3): the
 * category list with counts, its create/rename/reorder/delete mutations and
 * the optimistic assignment of a work to a category.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, queryKeys, type CategoriesResponse, type LibraryCategory } from "@/lib/api";
import { useStudyLanguageStore } from "@/stores/study-language";
import { assignInCounts, assignInPages, findCachedCategoryId, type LibraryPages } from "./library-cache";

/** GET /api/categories for the selected study language; `categories` is empty and the counts are 0 until loaded. */
export function useCategories() {
  const languageId = useStudyLanguageStore((state) => state.selectedId);
  const query = useQuery({
    queryKey: queryKeys.categories.list(languageId),
    queryFn: () => api.categories.list(languageId as number),
    enabled: languageId !== null
  });
  return {
    ...query,
    categories: query.data?.categories ?? [],
    totalCount: query.data?.totalCount ?? 0,
    uncategorisedCount: query.data?.uncategorisedCount ?? 0
  };
}

/** The create, rename, reorder and remove mutations; each refreshes the categories and the Library lists on success. Failures reject (409 `errors.categoryNameTaken` for duplicate names). */
export function useCategoryMutations() {
  const client = useQueryClient();
  const languageId = useStudyLanguageStore((state) => state.selectedId);
  const refresh = () =>
    Promise.all([client.invalidateQueries({ queryKey: queryKeys.categories.all }), client.invalidateQueries({ queryKey: queryKeys.library.all })]);
  const create = useMutation({ mutationFn: (name: string) => api.categories.create({ languageId: languageId as number, name }), onSuccess: refresh });
  const rename = useMutation({ mutationFn: ({ id, name }: { id: number; name: string }) => api.categories.rename(id, name), onSuccess: refresh });
  const reorder = useMutation({ mutationFn: (ids: number[]) => api.categories.reorder({ languageId: languageId as number, ids }), onSuccess: refresh });
  const remove = useMutation({ mutationFn: (id: number) => api.categories.remove(id), onSuccess: refresh });
  return {
    create: (name: string) => create.mutateAsync(name),
    rename: (id: number, name: string) => rename.mutateAsync({ id, name }),
    reorder: (ids: number[]) => reorder.mutateAsync(ids),
    remove: (id: number) => remove.mutateAsync(id)
  };
}

interface AssignContext {
  lists: [readonly unknown[], LibraryPages | undefined][];
  counts: [readonly unknown[], CategoriesResponse | undefined][];
}

/**
 * assign(materialId, categoryId | null) moves a work into a category (null =
 * uncategorised). The cached Library lists and category counts update at once
 * and roll back if the request fails; both refetch afterwards.
 */
export function useAssignCategory() {
  const client = useQueryClient();
  const mutation = useMutation<unknown, Error, { materialId: number; categoryId: number | null }, AssignContext>({
    mutationFn: ({ materialId, categoryId }) => api.materials.update(materialId, { categoryId }),
    onMutate: async ({ materialId, categoryId }) => {
      await Promise.all([client.cancelQueries({ queryKey: queryKeys.library.materialsAll }), client.cancelQueries({ queryKey: queryKeys.categories.all })]);
      const lists = client.getQueriesData<LibraryPages>({ queryKey: queryKeys.library.materialsAll });
      const counts = client.getQueriesData<CategoriesResponse>({ queryKey: queryKeys.categories.all });
      const previous = findCachedCategoryId(
        lists.map(([, data]) => data),
        materialId
      );
      for (const [key, data] of lists) {
        // Key layout: ["library", "materials", languageId, category, search].
        if (data) {
          client.setQueryData(key, assignInPages(data, materialId, categoryId, key[3] as LibraryCategory));
        }
      }
      for (const [key, data] of counts) {
        if (data && previous !== undefined) {
          client.setQueryData(key, assignInCounts(data, previous, categoryId));
        }
      }
      return { lists, counts };
    },
    onError: (_error, _variables, context) => {
      for (const [key, data] of [...(context?.lists ?? []), ...(context?.counts ?? [])]) {
        client.setQueryData(key, data);
      }
    },
    onSettled: () =>
      Promise.all([client.invalidateQueries({ queryKey: queryKeys.library.all }), client.invalidateQueries({ queryKey: queryKeys.categories.all })])
  });
  return { assign: (materialId: number, categoryId: number | null) => mutation.mutateAsync({ materialId, categoryId }) };
}

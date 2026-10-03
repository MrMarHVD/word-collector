/**
 * TanStack Query hooks for the materials feature: the paginated, polling
 * material list of the selected study language and the upload, rename and
 * delete mutations.
 */

import { infiniteQueryOptions, useInfiniteQuery, useMutation, useQueryClient, type InfiniteData, type QueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { api, queryKeys, refreshStudyData, type MaterialListItem, type MaterialsResponse } from "@/lib/api";
import { useStudyLanguageStore } from "@/stores/study-language";
import { hasPendingWork, MATERIAL_POLL_INTERVAL_MS } from "./materials";

type MaterialPages = InfiniteData<MaterialsResponse, number>;

/** All loaded materials of a paginated list, in order. */
export function flattenMaterials(data: InfiniteData<MaterialsResponse, unknown> | undefined): MaterialListItem[] {
  return data?.pages.flatMap((page) => page.materials) ?? [];
}

/**
 * GET /api/materials, 50 per page, offset-based like the legacy infinite
 * scroll. Polls every 1.5 s while any loaded material is importing or
 * translating (the legacy translation refresh).
 */
export function materialsListQuery(languageId: number | null, search: string) {
  return infiniteQueryOptions({
    queryKey: queryKeys.materials.list(languageId, search.trim()),
    queryFn: ({ pageParam }) => api.materials.list({ languageId: languageId as number, offset: pageParam, search }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) =>
      lastPage.materials.length === lastPage.pageSize ? pages.reduce((count, page) => count + page.materials.length, 0) : undefined,
    enabled: languageId !== null,
    refetchInterval: (query) => (hasPendingWork(flattenMaterials(query.state.data)) ? MATERIAL_POLL_INTERVAL_MS : false)
  });
}

/** The selected study language's materials matching `search`, with infinite-scroll paging. */
export function useMaterialsList(search: string) {
  const languageId = useStudyLanguageStore((state) => state.selectedId);
  const query = useInfiniteQuery(materialsListQuery(languageId, search));
  const materials = useMemo(() => flattenMaterials(query.data), [query.data]);
  return { ...query, materials };
}

/** Applies `update` to the materials of every cached list page, in both the reader's lists and the Library's. */
function updateCachedMaterials(client: QueryClient, update: (materials: MaterialListItem[]) => MaterialListItem[]) {
  for (const queryKey of [[...queryKeys.materials.all, "list"], queryKeys.library.materialsAll]) {
    client.setQueriesData<MaterialPages>({ queryKey }, (data) =>
      data ? { ...data, pages: data.pages.map((page) => ({ ...page, materials: update(page.materials) })) } : data
    );
  }
}

/** POST /api/materials for the selected study language; refreshes study data once the import has started. */
export function useUploadMaterial() {
  const client = useQueryClient();
  const languageId = useStudyLanguageStore((state) => state.selectedId);
  return useMutation({
    mutationFn: (file: File) => api.materials.upload({ languageId: languageId as number, file }),
    onSuccess: () => refreshStudyData(client)
  });
}

/** PATCH a material's title; updates the cached list and refetches that material's reader pages. */
export function useRenameMaterial() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ materialId, title }: { materialId: number; title: string }) => api.materials.update(materialId, { title }),
    onSuccess: ({ material }) => {
      updateCachedMaterials(client, (materials) => materials.map((entry) => (entry.id === material.id ? { ...entry, title: material.title } : entry)));
      return client.invalidateQueries({ queryKey: [...queryKeys.materials.all, "reader", material.id] });
    }
  });
}

/** DELETE a material; drops it from the cached list and refreshes study data. */
export function useDeleteMaterial() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (materialId: number) => api.materials.remove(materialId),
    onSuccess: (_result, materialId) => {
      updateCachedMaterials(client, (materials) => materials.filter((entry) => entry.id !== materialId));
      return refreshStudyData(client);
    }
  });
}

/**
 * Server state of the reader: the selected material, the page on screen and
 * the word mutations made from it (ported from reader.controller.js
 * loadMaterialReader and the materials controller's selection cache).
 *
 * Pages are fetched through the query cache, always from the network (as the
 * legacy reader did), then rendered from it, so invalidations after renames,
 * deletions and word changes refresh the page in place. Word changes update
 * the cached tokens optimistically; the refetch that follows is structurally
 * shared, so an unchanged page does not re-render.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, queryKeys } from "@/lib/api";
import type { MaterialReaderParams, MaterialReaderResponse, ReaderToken } from "@/lib/api/types";
import { readStorage, removeStorage, writeStorage } from "@/lib/storage";
import type { ReaderWordsPerPage } from "@/stores/reader-preferences";
import { readerFetchLimit } from "./reader-pagination";
import { readerSession, type ReaderView } from "./reader-session";

/** Poll interval while the open material's translations are still being prepared. */
const TRANSLATION_POLL_MS = 1500;

function selectedMaterialStorageKey(languageId: number): string {
  return `wordMarkerSelectedMaterialId:${languageId}`;
}

/** The material last opened in this study language (per-language localStorage key), or null. */
export function readCachedMaterialId(languageId: number | null): number | null {
  return languageId ? Number(readStorage(selectedMaterialStorageKey(languageId))) || null : null;
}

/** Remembers (or forgets, with null) the material open in this study language. */
export function writeCachedMaterialId(languageId: number | null, materialId: number | null): void {
  if (!languageId) {
    return;
  }
  if (materialId) {
    writeStorage(selectedMaterialStorageKey(languageId), String(materialId));
  } else {
    removeStorage(selectedMaterialStorageKey(languageId));
  }
}

/** GET /api/materials/:id for one page. */
function readerPageQuery(materialId: number, params: MaterialReaderParams) {
  return queryOptions({
    queryKey: queryKeys.materials.reader(materialId, params),
    queryFn: () => api.materials.reader(materialId, params)
  });
}

/** Prefix of every cached page of a material. */
function materialPagesKey(materialId: number) {
  return [...queryKeys.materials.all, "reader", materialId] as const;
}

export interface LoadOptions {
  /** Save the resolved start as the reading position (default true; restores and background reloads pass false). */
  persist?: boolean;
  /** Page size to request, when it has just changed (defaults to the current preference). */
  wordsPerPage?: ReaderWordsPerPage;
}

export interface ReaderMaterial {
  selectedMaterialId: number | null;
  /** The page on screen (possibly of the previously selected material while the next one loads). */
  data: MaterialReaderResponse | undefined;
  /**
   * Fetches and shows a page of `materialId`. `start` undefined uses the stored
   * reading position. Resolves to null when a newer load superseded this one.
   */
  load: (materialId: number, start?: number, options?: LoadOptions) => Promise<MaterialReaderResponse | null>;
  /** Reloads the page on screen at its start, e.g. after the words-per-page setting changed. */
  reload: (options?: LoadOptions) => Promise<MaterialReaderResponse | null>;
  /** Selects a material and remembers it for this study language (the page loads separately). */
  select: (materialId: number) => void;
  /** Closes the material and forgets it for this study language. */
  clear: () => void;
  /** Applies `updates` to every cached token of the word, like the legacy syncReaderWordTokens. */
  updateWordTokens: (wordId: number, updates: Partial<ReaderToken>) => void;
}

/**
 * Reader server state for one study language. Mount it under a component keyed
 * on the language, so a language switch starts from that language's saved
 * material. On mount it restores the last material (legacy restoreSelectedMaterial),
 * or reuses the page remembered from the previous visit to the reader.
 */
export function useReaderMaterial(languageId: number | null, wordsPerPage: ReaderWordsPerPage): ReaderMaterial {
  const queryClient = useQueryClient();
  const [remembered] = useState(() => (readerSession.languageId === languageId && readerSession.selectedMaterialId !== null ? readerSession : null));
  const [selectedMaterialId, setSelectedMaterialId] = useState<number | null>(() => remembered?.selectedMaterialId ?? readCachedMaterialId(languageId));
  const [view, setView] = useState<ReaderView | null>(() => remembered?.view ?? null);
  const loadSequence = useRef(0);
  const wordsPerPageRef = useRef(wordsPerPage);

  useEffect(() => {
    wordsPerPageRef.current = wordsPerPage;
  }, [wordsPerPage]);

  const { data } = useQuery({
    ...readerPageQuery(view?.materialId ?? 0, view?.params ?? {}),
    enabled: view !== null,
    // Pages are fetched explicitly (always from the network) and otherwise
    // refreshed only by invalidation or while translations are pending.
    staleTime: Infinity,
    refetchInterval: (query) => (query.state.data && !query.state.data.translationStatus.ready ? TRANSLATION_POLL_MS : false)
  });

  const load = useCallback(
    async (materialId: number, start?: number, { persist = true, wordsPerPage: pageSize = wordsPerPageRef.current }: LoadOptions = {}) => {
      const sequence = ++loadSequence.current;
      const params: MaterialReaderParams = { limit: readerFetchLimit(pageSize) };
      if (start !== undefined) {
        params.start = Math.max(start, 0);
      }
      const result = await queryClient.fetchQuery({ ...readerPageQuery(materialId, params), staleTime: 0 });
      if (sequence !== loadSequence.current) {
        return null;
      }
      setView({ materialId, params });
      if (persist && result.translationStatus?.ready) {
        // Saved in the background: the page is shown without waiting for it.
        api.materials.update(materialId, { readerStart: result.start }).catch(() => {});
      }
      return result;
    },
    [queryClient]
  );

  const reload = useCallback(
    (options?: LoadOptions) => {
      const current = view && queryClient.getQueryData<MaterialReaderResponse>(queryKeys.materials.reader(view.materialId, view.params));
      if (!view) {
        return Promise.resolve(null);
      }
      return load(view.materialId, current?.start ?? view.params.start, options);
    },
    [load, queryClient, view]
  );

  const select = useCallback(
    (materialId: number) => {
      setSelectedMaterialId(materialId);
      writeCachedMaterialId(languageId, materialId);
    },
    [languageId]
  );

  const clear = useCallback(() => {
    loadSequence.current += 1;
    setSelectedMaterialId(null);
    setView(null);
    writeCachedMaterialId(languageId, null);
  }, [languageId]);

  const updateWordTokens = useCallback(
    (wordId: number, updates: Partial<ReaderToken>) => {
      if (!view) {
        return;
      }
      queryClient.setQueriesData<MaterialReaderResponse>({ queryKey: materialPagesKey(view.materialId) }, (page) =>
        page && page.tokens.some((token) => token.wordId === wordId)
          ? { ...page, tokens: page.tokens.map((token) => (token.wordId === wordId ? { ...token, ...updates } : token)) }
          : page
      );
    },
    [queryClient, view]
  );

  // Restore the material last read in this language, unless the previous
  // visit's page is being reused.
  const restoreRef = useRef({ remembered, selectedMaterialId, load, clear });
  useEffect(() => {
    const { remembered: reused, selectedMaterialId: cachedId, load: loadPage, clear: forget } = restoreRef.current;
    if (reused?.view || !cachedId) {
      return;
    }
    loadPage(cachedId, undefined, { persist: false }).catch(() => forget());
  }, []);

  // Remember the state for the next visit to the reader.
  useEffect(() => {
    readerSession.languageId = languageId;
    readerSession.selectedMaterialId = selectedMaterialId;
    readerSession.view = view;
  }, [languageId, selectedMaterialId, view]);

  return { selectedMaterialId, data: selectedMaterialId === null ? undefined : data, load, reload, select, clear, updateWordTokens };
}

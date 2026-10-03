/**
 * Server state of the reader: the open material (the route's :materialId), the page on screen and
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
import { useSessionStore } from "@/stores/session";
import { readerFetchLimit } from "./reader-pagination";
import { readerSession, type ReaderView } from "./reader-session";

/** Poll interval while the open material's translations are still being prepared. */
const TRANSLATION_POLL_MS = 1500;

function selectedMaterialStorageKey(userId: number, languageId: number): string {
  return `wordMarkerSelectedMaterialId:${userId}:${languageId}`;
}

/** Pre-user-scoping key, shared by every account that used this browser. */
function legacySelectedMaterialStorageKey(languageId: number): string {
  return `wordMarkerSelectedMaterialId:${languageId}`;
}

/**
 * The material this user last opened in this study language (per-user,
 * per-language localStorage key), or null. A legacy per-language entry is
 * moved to the first user who reads it, as that key used to be shared.
 */
export function readCachedMaterialId(userId: number | null, languageId: number | null): number | null {
  if (!userId || !languageId) {
    return null;
  }
  const key = selectedMaterialStorageKey(userId, languageId);
  let stored = readStorage(key);
  if (stored === null) {
    const legacyKey = legacySelectedMaterialStorageKey(languageId);
    stored = readStorage(legacyKey);
    if (stored !== null) {
      writeStorage(key, stored);
      removeStorage(legacyKey);
    }
  }
  return Number(stored) || null;
}

/** Remembers (or forgets, with null) the material this user has open in this study language. */
export function writeCachedMaterialId(userId: number | null, languageId: number | null, materialId: number | null): void {
  if (!userId || !languageId) {
    return;
  }
  if (materialId) {
    writeStorage(selectedMaterialStorageKey(userId, languageId), String(materialId));
  } else {
    removeStorage(selectedMaterialStorageKey(userId, languageId));
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
  /** Drops the page on screen and forgets the open material for this study language (the route changes separately). */
  clear: () => void;
  /** Applies `updates` to every cached token of the word, like the legacy syncReaderWordTokens. */
  updateWordTokens: (wordId: number, updates: Partial<ReaderToken>) => void;
}

/**
 * Reader server state for one study language and the work in the route
 * (`materialId`). Mount it under a component keyed on the
 * language. Whenever `materialId` changes (open, back/forward, reload) the work
 * loads at its saved position and is remembered for the language, unless the
 * page remembered from the previous visit to the reader is that work's.
 * `onLoadFailed` is called when the work cannot be loaded (e.g. it does not exist).
 */
export function useReaderMaterial(languageId: number | null, wordsPerPage: ReaderWordsPerPage, materialId: number, onLoadFailed?: () => void): ReaderMaterial {
  const queryClient = useQueryClient();
  const userId = useSessionStore((state) => state.user?.id ?? null);
  const [view, setView] = useState<ReaderView | null>(() =>
    readerSession.languageId === languageId && readerSession.view?.materialId === materialId ? readerSession.view : null
  );
  const viewRef = useRef(view);
  const onLoadFailedRef = useRef(onLoadFailed);
  const loadSequence = useRef(0);
  const wordsPerPageRef = useRef(wordsPerPage);

  useEffect(() => {
    wordsPerPageRef.current = wordsPerPage;
    viewRef.current = view;
    onLoadFailedRef.current = onLoadFailed;
  });

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

  const clear = useCallback(() => {
    loadSequence.current += 1;
    setView(null);
    writeCachedMaterialId(userId, languageId, null);
  }, [userId, languageId]);

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

  // Load the routed work, unless the page on screen already is that work's.
  useEffect(() => {
    writeCachedMaterialId(userId, languageId, materialId);
    if (viewRef.current?.materialId === materialId) {
      return;
    }
    load(materialId, undefined, { persist: false }).catch(() => {
      writeCachedMaterialId(userId, languageId, null);
      onLoadFailedRef.current?.();
    });
  }, [load, materialId, userId, languageId]);

  // Remember the state for the next visit to the reader.
  useEffect(() => {
    readerSession.languageId = languageId;
    readerSession.selectedMaterialId = materialId;
    readerSession.view = view;
  }, [languageId, materialId, view]);

  // While the next work loads, `data` may still be the previous work's page.
  return { selectedMaterialId: materialId, data: data?.material.id === materialId ? data : undefined, load, reload, clear, updateWordTokens };
}

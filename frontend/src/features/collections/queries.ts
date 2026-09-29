/** TanStack Query definitions for the vocab word lists. */

import { queryOptions } from "@tanstack/react-query";
import { api, queryKeys } from "@/lib/api";
import type { Word } from "@/lib/api/types";
import type { CollectionSelection } from "./word-list";

const NO_WORDS: Word[] = [];

/**
 * Words of one collection, or of the whole study language for "all",
 * filtered server-side by `search`. "All" without a study language has no words.
 */
export function collectionWordsQuery(selection: CollectionSelection, languageId: number | null, search: string) {
  return queryOptions({
    queryKey: selection === "all" ? queryKeys.words.byLanguage(languageId ?? 0, search) : queryKeys.words.byCollection(selection, search),
    queryFn: async () => {
      if (selection !== "all") {
        return (await api.words.listByCollection(selection, { search })).words;
      }
      return languageId === null ? NO_WORDS : (await api.words.listByLanguage(languageId, { search })).words;
    }
  });
}

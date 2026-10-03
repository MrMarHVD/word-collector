/**
 * TanStack Query keys for all server data. Every key starts with its domain's
 * `all` prefix so `invalidateQueries({ queryKey: queryKeys.<domain>.all })`
 * refreshes the whole domain. Keys that depend on the study language include
 * its id, so a language switch never serves another language's cache.
 */

import type { AdminUsersParams, AdminWordsParams, LibraryCategory, MaterialReaderParams, PracticeMode } from "./types";

export const queryKeys = {
  dashboard: {
    all: ["dashboard"] as const,
    summary: (languageId: number | null) => ["dashboard", "summary", languageId] as const,
    documents: (languageId: number | null, search: string) => ["dashboard", "documents", languageId, search] as const
  },
  languages: {
    all: ["languages"] as const
  },
  materials: {
    all: ["materials"] as const,
    list: (languageId: number | null, search: string) => ["materials", "list", languageId, search] as const,
    reader: (materialId: number, params: MaterialReaderParams) => ["materials", "reader", materialId, params] as const
  },
  library: {
    all: ["library"] as const,
    /** Prefix of every Library list (any category or search) of every language. */
    materialsAll: ["library", "materials"] as const,
    materials: (languageId: number | null, category: LibraryCategory, search: string) => ["library", "materials", languageId, category, search] as const,
    lastOpened: (languageId: number | null) => ["library", "last-opened", languageId] as const
  },
  categories: {
    all: ["categories"] as const,
    list: (languageId: number | null) => ["categories", "list", languageId] as const
  },
  words: {
    all: ["words"] as const,
    byLanguage: (languageId: number, search: string) => ["words", "language", languageId, search] as const,
    byCollection: (collectionId: number, search: string) => ["words", "collection", collectionId, search] as const
  },
  practice: {
    all: ["practice"] as const,
    session: (languageId: number, mode: PracticeMode | null) => ["practice", "session", languageId, mode] as const
  },
  admin: {
    all: ["admin"] as const,
    users: (params: Omit<AdminUsersParams, "cursorValue" | "cursorId">) => ["admin", "users", params] as const,
    wordLanguages: ["admin", "word-languages"] as const,
    words: (params: Omit<AdminWordsParams, "cursor">) => ["admin", "words", params] as const,
    audit: (page: number) => ["admin", "audit", page] as const
  }
} as const;

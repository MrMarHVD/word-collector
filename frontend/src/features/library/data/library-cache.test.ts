import { describe, expect, it } from "vitest";
import type { CategoriesResponse, MaterialListItem } from "@/lib/api/types";
import { assignInCounts, assignInPages, categoryMatches, findCachedCategoryId, type LibraryPages } from "./library-cache";

function material(id: number, categoryId: number | null): MaterialListItem {
  return {
    id,
    title: `Work ${id}`,
    fileName: "work.txt",
    fileType: "txt",
    wordCount: 10,
    readerStart: 0,
    createdAt: "2026-01-01T00:00:00Z",
    importStatus: "ready",
    importTotal: null,
    importProcessed: null,
    importError: null,
    categoryId,
    lastOpenedAt: null,
    readTokens: 0,
    totalTokens: 10,
    translationStatus: { targetLanguage: "English", ready: true, totalWords: 10, completedWords: 10, missingWords: 0 }
  };
}

function pages(...ids: [number, number | null][]): LibraryPages {
  return { pages: [{ materials: ids.map(([id, categoryId]) => material(id, categoryId)), pageSize: 50 }], pageParams: [0] };
}

describe("categoryMatches", () => {
  it("matches the all, uncategorised and single-category filters", () => {
    expect(categoryMatches("all", 3)).toBe(true);
    expect(categoryMatches("uncategorised", null)).toBe(true);
    expect(categoryMatches("uncategorised", 3)).toBe(false);
    expect(categoryMatches(3, 3)).toBe(true);
    expect(categoryMatches(3, null)).toBe(false);
  });
});

describe("findCachedCategoryId", () => {
  it("finds a work's category across lists, or undefined when uncached", () => {
    expect(findCachedCategoryId([undefined, pages([1, 4], [2, null])], 1)).toBe(4);
    expect(findCachedCategoryId([pages([2, null])], 2)).toBeNull();
    expect(findCachedCategoryId([pages([2, null])], 9)).toBeUndefined();
  });
});

describe("assignInPages", () => {
  it("updates the category in the all list", () => {
    const next = assignInPages(pages([1, null], [2, null]), 1, 5, "all");
    expect(next.pages[0].materials.map((m) => [m.id, m.categoryId])).toEqual([
      [1, 5],
      [2, null]
    ]);
  });

  it("removes the work from a list it no longer belongs to", () => {
    expect(assignInPages(pages([1, null], [2, null]), 1, 5, "uncategorised").pages[0].materials.map((m) => m.id)).toEqual([2]);
    expect(assignInPages(pages([1, 5]), 1, null, 5).pages[0].materials).toEqual([]);
  });
});

describe("assignInCounts", () => {
  const counts: CategoriesResponse = {
    categories: [
      { id: 1, name: "A", position: 0, materialCount: 2 },
      { id: 2, name: "B", position: 1, materialCount: 0 }
    ],
    totalCount: 5,
    uncategorisedCount: 3
  };

  it("moves a work from uncategorised into a category", () => {
    const next = assignInCounts(counts, null, 2);
    expect(next.categories.map((c) => c.materialCount)).toEqual([2, 1]);
    expect(next.uncategorisedCount).toBe(2);
    expect(next.totalCount).toBe(5);
  });

  it("moves a work between categories and back to uncategorised", () => {
    expect(assignInCounts(counts, 1, 2).categories.map((c) => c.materialCount)).toEqual([1, 1]);
    const out = assignInCounts(counts, 1, null);
    expect(out.categories.map((c) => c.materialCount)).toEqual([1, 0]);
    expect(out.uncategorisedCount).toBe(4);
  });

  it("is a no-op when the category is unchanged", () => {
    expect(assignInCounts(counts, 1, 1)).toBe(counts);
  });
});

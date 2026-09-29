import { describe, expect, it } from "vitest";
import type { DashboardDocumentsResponse } from "@/lib/api";
import { documentMeta, isNearScrollEnd, nextDocumentsOffset, parseDashboardStatsTab, progressPercents } from "./progress";

function page(count: number, pageSize = 24): DashboardDocumentsResponse {
  return { documents: Array.from({ length: count }, () => ({}) as DashboardDocumentsResponse["documents"][number]), pageSize, offset: 0 };
}

describe("parseDashboardStatsTab", () => {
  it("keeps documents and defaults everything else to overview", () => {
    expect(parseDashboardStatsTab("documents")).toBe("documents");
    expect(parseDashboardStatsTab("overview")).toBe("overview");
    expect(parseDashboardStatsTab("other")).toBe("overview");
    expect(parseDashboardStatsTab(null)).toBe("overview");
  });
});

describe("progressPercents", () => {
  it("rounds the known and known-plus-learning stops", () => {
    expect(progressPercents({ totalWords: 3, knownWords: 1, learningWords: 1 })).toEqual({ knownPercent: 33, learningPercent: 67 });
    expect(progressPercents({ totalWords: 10, knownWords: 10, learningWords: 0 })).toEqual({ knownPercent: 100, learningPercent: 100 });
  });

  it("is zero without words", () => {
    expect(progressPercents({ totalWords: 0, knownWords: 0, learningWords: 0 })).toEqual({ knownPercent: 0, learningPercent: 0 });
  });
});

describe("documentMeta", () => {
  it("joins the language and the upper-cased file type", () => {
    expect(documentMeta({ languageName: "Japanese", fileType: "epub" })).toBe("Japanese / EPUB");
  });

  it("skips empty parts", () => {
    expect(documentMeta({ languageName: "Japanese", fileType: "" })).toBe("Japanese");
    expect(documentMeta({ languageName: "", fileType: "txt" })).toBe("TXT");
    expect(documentMeta({})).toBe("");
  });
});

describe("nextDocumentsOffset", () => {
  it("continues after every loaded document while pages are full", () => {
    expect(nextDocumentsOffset([page(24)])).toBe(24);
    expect(nextDocumentsOffset([page(24), page(24)])).toBe(48);
  });

  it("stops after a short page", () => {
    expect(nextDocumentsOffset([page(24), page(5)])).toBeUndefined();
    expect(nextDocumentsOffset([page(0)])).toBeUndefined();
    expect(nextDocumentsOffset([])).toBeUndefined();
  });
});

describe("isNearScrollEnd", () => {
  it("is true within 140px of the bottom", () => {
    expect(isNearScrollEnd({ scrollHeight: 1000, scrollTop: 761, clientHeight: 100 })).toBe(true);
    expect(isNearScrollEnd({ scrollHeight: 1000, scrollTop: 760, clientHeight: 100 })).toBe(false);
  });
});

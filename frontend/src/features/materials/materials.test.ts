import { describe, expect, it } from "vitest";
import type { MaterialListItem } from "@/lib/api/types";
import { BETA_MAX_MATERIAL_UPLOAD_BYTES, BETA_MAX_MATERIALS_PER_USER, hasPendingWork, importProgress, materialRowState, validateImportFile } from "./materials";

function material(overrides: Partial<MaterialListItem> = {}): MaterialListItem {
  return {
    id: 1,
    title: "Work",
    fileName: "work.txt",
    fileType: "txt",
    wordCount: 10,
    readerStart: 0,
    createdAt: "2026-01-01T00:00:00Z",
    importStatus: "ready",
    importTotal: null,
    importProcessed: null,
    importError: null,
    categoryId: null,
    lastOpenedAt: null,
    readTokens: 0,
    totalTokens: 10,
    translationStatus: { targetLanguage: "English", ready: true, totalWords: 10, completedWords: 10, missingWords: 0 },
    ...overrides
  };
}

const translating = { targetLanguage: "English", ready: false, totalWords: 10, completedWords: 4, missingWords: 6 };

describe("materialRowState", () => {
  it("classifies import and translation states", () => {
    expect(materialRowState(material({ importStatus: "processing" }))).toBe("importing");
    expect(materialRowState(material({ importStatus: "failed" }))).toBe("failed");
    expect(materialRowState(material({ translationStatus: translating }))).toBe("translating");
    expect(materialRowState(material())).toBe("ready");
  });
});

describe("hasPendingWork", () => {
  it("is true while any material imports or translates", () => {
    expect(hasPendingWork([])).toBe(false);
    expect(hasPendingWork([material(), material({ importStatus: "failed" })])).toBe(false);
    expect(hasPendingWork([material(), material({ importStatus: "processing" })])).toBe(true);
    expect(hasPendingWork([material({ translationStatus: translating })])).toBe(true);
  });
});

describe("importProgress", () => {
  it("is determinate once the total is known, capped at 100", () => {
    expect(importProgress({ importTotal: 8, importProcessed: 3 })).toEqual({ percent: 38, determinate: true });
    expect(importProgress({ importTotal: 8, importProcessed: 12 })).toEqual({ percent: 100, determinate: true });
  });

  it("is an indeterminate full bar without a total", () => {
    expect(importProgress({ importTotal: null, importProcessed: null })).toEqual({ percent: 100, determinate: false });
    expect(importProgress(null)).toEqual({ percent: 100, determinate: false });
  });
});

describe("validateImportFile", () => {
  it("requires a file", () => {
    expect(validateImportFile(null, 0)).toEqual({ key: "reader.chooseFile" });
  });

  it("rejects files over the beta size limit", () => {
    expect(validateImportFile({ size: BETA_MAX_MATERIAL_UPLOAD_BYTES + 1 }, 0)).toEqual({ key: "errors.materialFileTooLarge", values: { maxMegabytes: "50" } });
    expect(validateImportFile({ size: BETA_MAX_MATERIAL_UPLOAD_BYTES }, 0)).toBeNull();
  });

  it("rejects uploads at the beta material limit", () => {
    expect(validateImportFile({ size: 1 }, BETA_MAX_MATERIALS_PER_USER)).toEqual({ key: "errors.materialLimitReached", values: { maxDocuments: "10" } });
    expect(validateImportFile({ size: 1 }, BETA_MAX_MATERIALS_PER_USER - 1)).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { translationModelFor } from "./translation-models";

describe("translationModelFor", () => {
  it("maps Japanese and Chinese to their own models, case-insensitively", () => {
    expect(translationModelFor("Japanese")?.sourceCode).toBe("ja");
    expect(translationModelFor("CHINESE")?.sourceCode).toBe("zh");
    expect(translationModelFor("Japanese")?.files.model.url).toBe("/models/ja-en-2.1/model.bin");
    expect(translationModelFor("Chinese")?.files.model.url).toBe("/models/zh-en-2.1/model.bin");
  });

  it("keeps a separate Cache API entry per model", () => {
    expect(translationModelFor("Japanese")?.cacheName).not.toBe(translationModelFor("Chinese")?.cacheName);
  });

  it("returns null for languages without a model", () => {
    expect(translationModelFor("English")).toBeNull();
    expect(translationModelFor("")).toBeNull();
    expect(translationModelFor(null)).toBeNull();
    expect(translationModelFor(undefined)).toBeNull();
  });
});

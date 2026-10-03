import { describe, expect, it } from "vitest";
import { pickLastOpenedMaterialId } from "./reader-redirect";

describe("pickLastOpenedMaterialId", () => {
  it("picks the most recently opened work", () => {
    const materials = [
      { id: 1, lastOpenedAt: "2026-01-01T00:00:00Z" },
      { id: 2, lastOpenedAt: "2026-03-01T00:00:00Z" },
      { id: 3, lastOpenedAt: null }
    ];
    expect(pickLastOpenedMaterialId(materials, 9)).toBe(2);
  });

  it("falls back to the remembered work, then to null", () => {
    expect(pickLastOpenedMaterialId([{ id: 3, lastOpenedAt: null }], 9)).toBe(9);
    expect(pickLastOpenedMaterialId([{ id: 3 } as { id: number; lastOpenedAt: null }], null)).toBeNull();
    expect(pickLastOpenedMaterialId([], null)).toBeNull();
  });
});

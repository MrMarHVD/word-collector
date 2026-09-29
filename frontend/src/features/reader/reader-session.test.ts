import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@/lib/api/types";
import { useSessionStore } from "@/stores/session";
import { useCollectionsViewStore } from "../collections/collections-store";
import { readerSession } from "./reader-session";
import { readCachedMaterialId, writeCachedMaterialId } from "./use-reader-material";

// In-memory localStorage: Node's built-in localStorage global (unusable without --localstorage-file) shadows jsdom's.
function memoryStorage(): Pick<Storage, "getItem" | "setItem" | "removeItem"> {
  const items = new Map<string, string>();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
    removeItem: (key) => void items.delete(key)
  };
}

beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage());
  useSessionStore.setState({ user: { id: 1 } as User });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("session reset", () => {
  it("forgets the reader and vocab view state when the session ends", () => {
    Object.assign(readerSession, { languageId: 3, selectedMaterialId: 9, view: { materialId: 9, params: {} }, sidebarTab: "settings" });
    useCollectionsViewStore.setState({ selectedCollectionId: 4, search: "cat" });
    useSessionStore.getState().handleUnauthorized();
    expect(readerSession).toEqual({ languageId: null, selectedMaterialId: null, view: null, sidebarTab: "read", panel: null });
    expect(useCollectionsViewStore.getState()).toMatchObject({ selectedCollectionId: "all", search: "" });
  });
});

describe("cached material id", () => {
  it("is scoped per user and language", () => {
    writeCachedMaterialId(1, 3, 9);
    expect(readCachedMaterialId(1, 3)).toBe(9);
    expect(readCachedMaterialId(2, 3)).toBeNull();
    writeCachedMaterialId(2, 3, null);
    expect(readCachedMaterialId(1, 3)).toBe(9);
    writeCachedMaterialId(1, 3, null);
    expect(readCachedMaterialId(1, 3)).toBeNull();
  });

  it("moves a legacy per-language entry to the first user who reads it", () => {
    window.localStorage.setItem("wordMarkerSelectedMaterialId:3", "7");
    expect(readCachedMaterialId(1, 3)).toBe(7);
    expect(window.localStorage.getItem("wordMarkerSelectedMaterialId:1:3")).toBe("7");
    expect(window.localStorage.getItem("wordMarkerSelectedMaterialId:3")).toBeNull();
    expect(readCachedMaterialId(2, 3)).toBeNull();
  });

  it("is null without a user or language", () => {
    expect(readCachedMaterialId(null, 3)).toBeNull();
    expect(readCachedMaterialId(1, null)).toBeNull();
  });
});

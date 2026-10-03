import { describe, expect, it } from "vitest";
import { isReaderPath, libraryPath, parseLibraryAddress, parseLibraryCategory, pathForTab, readerPath, tabForPath } from "./route-paths";

describe("tabForPath", () => {
  it("maps /library and every /reader path to the single reader (Read) tab", () => {
    expect(pathForTab("reader")).toBe("/library");
    expect(tabForPath("/library")).toBe("reader");
    expect(tabForPath("/reader")).toBe("reader");
    expect(tabForPath("/reader/12")).toBe("reader");
    expect(tabForPath("/readers")).toBeNull();
    expect(tabForPath("/vocab")).toBe("collections");
  });
});

describe("readerPath and isReaderPath", () => {
  it("builds and recognises Reader URLs", () => {
    expect(readerPath(7)).toBe("/reader/7");
    expect(isReaderPath("/reader")).toBe(true);
    expect(isReaderPath("/reader/7")).toBe(true);
    expect(isReaderPath("/library")).toBe(false);
  });
});

describe("parseLibraryCategory", () => {
  it("accepts all, uncategorised and positive integer ids, and falls back to all", () => {
    expect(parseLibraryCategory("uncategorised")).toBe("uncategorised");
    expect(parseLibraryCategory("5")).toBe(5);
    expect(parseLibraryCategory("all")).toBe("all");
    expect(parseLibraryCategory(null)).toBe("all");
    expect(parseLibraryCategory("0")).toBe("all");
    expect(parseLibraryCategory("1.5")).toBe("all");
    expect(parseLibraryCategory("x")).toBe("all");
  });
});

describe("libraryPath and parseLibraryAddress", () => {
  it("omits defaults and round-trips an address", () => {
    expect(libraryPath()).toBe("/library");
    expect(libraryPath({ category: "all", q: "" })).toBe("/library");
    const path = libraryPath({ category: 3, q: "a b", focus: 9 });
    expect(path).toBe("/library?category=3&q=a+b&focus=9");
    expect(parseLibraryAddress(new URLSearchParams(path.split("?")[1]))).toEqual({ category: 3, q: "a b", focus: 9 });
  });

  it("defaults a bare address", () => {
    expect(parseLibraryAddress(new URLSearchParams())).toEqual({ category: "all", q: "", focus: undefined });
    expect(parseLibraryAddress(new URLSearchParams("focus=abc")).focus).toBeUndefined();
  });
});

import { describe, expect, it } from "vitest";
import { FIT_READER_FETCH_LIMIT, fitTokenCount, pageTurnStart, readerFetchLimit, readerPageStatus } from "./reader-pagination";

describe("readerFetchLimit", () => {
  it("fetches a large batch to fit, otherwise the page size", () => {
    expect(readerFetchLimit("fit")).toBe(FIT_READER_FETCH_LIMIT);
    expect(readerFetchLimit(250)).toBe(250);
  });
});

describe("pageTurnStart", () => {
  const base = { start: 250, visibleCount: 250, wordCount: 1000, wordsPerPage: 250 as const };

  it("steps by the page size", () => {
    expect(pageTurnStart({ ...base, direction: "next" })).toBe(500);
    expect(pageTurnStart({ ...base, direction: "prev" })).toBe(0);
  });

  it("clamps going back at the start and stops at either end", () => {
    expect(pageTurnStart({ ...base, start: 100, direction: "prev" })).toBe(0);
    expect(pageTurnStart({ ...base, start: 0, direction: "prev" })).toBeNull();
    expect(pageTurnStart({ ...base, start: 750, direction: "next" })).toBeNull();
  });

  it("steps by the tokens shown in fit mode", () => {
    expect(pageTurnStart({ start: 40, visibleCount: 37, wordCount: 1000, wordsPerPage: "fit", direction: "next" })).toBe(77);
    expect(pageTurnStart({ start: 40, visibleCount: 37, wordCount: 1000, wordsPerPage: "fit", direction: "prev" })).toBe(3);
    expect(pageTurnStart({ start: 0, visibleCount: 0, wordCount: 1000, wordsPerPage: "fit", direction: "next" })).toBe(1);
  });
});

describe("readerPageStatus", () => {
  it("reports the one-based range, button states and progress", () => {
    expect(readerPageStatus(0, 250, 1000)).toEqual({ first: 1, end: 250, total: 1000, prevDisabled: true, nextDisabled: false, progressPercent: 25 });
    expect(readerPageStatus(750, 250, 1000)).toMatchObject({ end: 1000, prevDisabled: false, nextDisabled: true, progressPercent: 100 });
  });

  it("caps the end at the word count and handles empty materials", () => {
    expect(readerPageStatus(900, 250, 1000).end).toBe(1000);
    expect(readerPageStatus(0, 0, 0)).toMatchObject({ end: 0, progressPercent: 0, nextDisabled: true });
  });
});

describe("fitTokenCount", () => {
  it("finds the largest count that fits", () => {
    const probes: number[] = [];
    const count = fitTokenCount(1000, (value) => {
      probes.push(value);
      return value <= 137;
    });
    expect(count).toBe(137);
    expect(probes.length).toBeLessThanOrEqual(10);
  });

  it("returns all tokens when everything fits, and at least one", () => {
    expect(fitTokenCount(40, () => true)).toBe(40);
    expect(fitTokenCount(40, () => false)).toBe(1);
  });
});

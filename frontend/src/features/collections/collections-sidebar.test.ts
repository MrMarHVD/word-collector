import { describe, expect, it } from "vitest";
import { collectionsSidebarColumnWidth } from "./collections-sidebar";

describe("collectionsSidebarColumnWidth", () => {
  it("is the sidebar plus its gap when open", () => {
    expect(collectionsSidebarColumnWidth(false, 1280)).toBe(274);
  });

  it("collapses to nothing where the centred shell clears the re-open button", () => {
    expect(collectionsSidebarColumnWidth(true, 1600)).toBe(0);
  });

  it("keeps a gutter for the re-open button on narrower viewports", () => {
    expect(collectionsSidebarColumnWidth(true, 800)).toBe(40);
    expect(collectionsSidebarColumnWidth(true, 1280)).toBe(6);
  });
});

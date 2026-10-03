import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setCsrfToken, setUnauthorizedHandler } from "./client";
import * as categories from "./categories";
import * as materials from "./materials";

type FetchCall = [string, RequestInit];

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn().mockImplementation(async () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } }));
  vi.stubGlobal("fetch", fetchMock);
  setCsrfToken("token");
  setUnauthorizedHandler(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function lastCall(): { url: string; init: RequestInit; body: unknown } {
  const [url, init] = fetchMock.mock.calls.at(-1) as FetchCall;
  return { url, init, body: typeof init.body === "string" ? JSON.parse(init.body) : undefined };
}

describe("categories client", () => {
  it("lists a language's categories", async () => {
    await categories.list(3);
    expect(lastCall().url).toBe("/api/categories?languageId=3");
  });

  it("creates and renames with a trimmed name and the CSRF token", async () => {
    await categories.create({ languageId: 3, name: "  Novels " });
    expect(lastCall()).toMatchObject({ url: "/api/categories", init: { method: "POST" }, body: { languageId: 3, name: "Novels" } });
    expect((lastCall().init.headers as Record<string, string>)["x-csrf-token"]).toBe("token");
    await categories.rename(7, " Essays ");
    expect(lastCall()).toMatchObject({ url: "/api/categories/7", init: { method: "PATCH" }, body: { name: "Essays" } });
  });

  it("reorders with PUT and deletes", async () => {
    await categories.reorder({ languageId: 3, ids: [2, 1] });
    expect(lastCall()).toMatchObject({ url: "/api/categories/order", init: { method: "PUT" }, body: { languageId: 3, ids: [2, 1] } });
    await categories.remove(7);
    expect(lastCall()).toMatchObject({ url: "/api/categories/7", init: { method: "DELETE" } });
  });
});

describe("materials client (Library additions)", () => {
  it("lists with the category filter, omitting it when unset", async () => {
    await materials.list({ languageId: 3, search: " abc ", category: "uncategorised" });
    expect(lastCall().url).toBe("/api/materials?languageId=3&offset=0&search=abc&category=uncategorised");
    await materials.list({ languageId: 3, category: 12 });
    expect(lastCall().url).toBe("/api/materials?languageId=3&offset=0&category=12");
    await materials.list({ languageId: 3 });
    expect(lastCall().url).toBe("/api/materials?languageId=3&offset=0");
  });

  it("assigns a category (or null) and records an open", async () => {
    await materials.update(5, { categoryId: null });
    expect(lastCall()).toMatchObject({ url: "/api/materials/5", init: { method: "PATCH" }, body: { categoryId: null } });
    await materials.markOpened(5);
    expect(lastCall()).toMatchObject({ url: "/api/materials/5/opened", init: { method: "POST" } });
  });
});

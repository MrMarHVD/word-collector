import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, errorMessage, getCsrfToken, isCsrfRejection, request, setCsrfToken, setUnauthorizedHandler } from "./client";
import { useLocaleStore } from "@/stores/locale";

type FetchCall = [string, RequestInit];

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  setCsrfToken(null);
  setUnauthorizedHandler(() => {});
  useLocaleStore.setState({ locale: "en" });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("request", () => {
  it("sends GETs with cookies, a JSON content type and the query string, without a CSRF header", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    await expect(request("/api/dashboard", { query: { languageId: 3, search: "", empty: null } })).resolves.toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0] as FetchCall;
    expect(url).toBe("/api/dashboard?languageId=3");
    expect(init.credentials).toBe("include");
    expect(init.headers).toEqual({ "content-type": "application/json" });
  });

  it("fetches the CSRF token lazily for unsafe methods and sends it as x-csrf-token", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { csrfToken: "token-1", user: null })).mockResolvedValueOnce(jsonResponse(200, { done: true }));
    await request("/api/words/status", { method: "POST", body: { wordIds: [1], status: "known" } });
    expect((fetchMock.mock.calls[0] as FetchCall)[0]).toBe("/api/auth/me");
    const [url, init] = fetchMock.mock.calls[1] as FetchCall;
    expect(url).toBe("/api/words/status");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ "x-csrf-token": "token-1", "content-type": "application/json" });
    expect(init.body).toBe(JSON.stringify({ wordIds: [1], status: "known" }));
  });

  it("reuses a known token and rotates it from response bodies", async () => {
    setCsrfToken("old");
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { changed: true, csrfToken: "new" }));
    await request("/api/settings/password", { method: "POST", body: {} });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((fetchMock.mock.calls[0] as FetchCall)[1].headers).toMatchObject({ "x-csrf-token": "old" });
    expect(getCsrfToken()).toBe("new");
  });

  it("clears the token when a response carries csrfToken: null", async () => {
    setCsrfToken("old");
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { deleted: true, csrfToken: null }));
    await request("/api/settings/account", { method: "DELETE", body: { confirmation: "x" } });
    expect(getCsrfToken()).toBeNull();
  });

  it("sends FormData without a content type", async () => {
    setCsrfToken("t");
    fetchMock.mockResolvedValueOnce(jsonResponse(201, { material: { id: 1 } }));
    const form = new FormData();
    form.append("languageId", "1");
    await request("/api/materials", { method: "POST", body: form });
    const init = (fetchMock.mock.calls[0] as FetchCall)[1];
    expect(init.body).toBe(form);
    expect(init.headers).toEqual({ "x-csrf-token": "t" });
  });

  it("calls the unauthorised handler on 401 unless the call opts out", async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    fetchMock.mockResolvedValue(jsonResponse(401, { error: "Authentication required.", errorKey: "errors.authenticationRequired" }));
    await expect(request("/api/dashboard")).rejects.toBeInstanceOf(ApiError);
    expect(handler).toHaveBeenCalledTimes(1);
    await expect(request("/api/auth/login", { method: "POST", body: {}, handleUnauthorized: false })).rejects.toBeInstanceOf(ApiError);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("refetches an expired CSRF token and retries the unsafe request once", async () => {
    setCsrfToken("expired");
    fetchMock
      .mockResolvedValueOnce(jsonResponse(403, { errorKey: "errors.csrfInvalid" }))
      .mockResolvedValueOnce(jsonResponse(200, { csrfToken: "fresh", user: null }))
      .mockResolvedValueOnce(jsonResponse(200, { loggedOut: true }));
    await expect(request("/api/auth/logout", { method: "POST" })).resolves.toEqual({ loggedOut: true });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["/api/auth/logout", "/api/auth/me", "/api/auth/logout"]);
    expect((fetchMock.mock.calls[0] as FetchCall)[1].headers).toMatchObject({ "x-csrf-token": "expired" });
    expect((fetchMock.mock.calls[2] as FetchCall)[1].headers).toMatchObject({ "x-csrf-token": "fresh" });
  });

  it("gives up after one CSRF retry and throws the rejection", async () => {
    setCsrfToken("expired");
    fetchMock
      .mockResolvedValueOnce(jsonResponse(403, { errorKey: "errors.csrfInvalid" }))
      .mockResolvedValueOnce(jsonResponse(200, { csrfToken: "fresh", user: null }))
      .mockResolvedValueOnce(jsonResponse(403, { errorKey: "errors.csrfInvalid" }));
    const error = await request("/api/words/status", { method: "POST", body: {} }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).errorKey).toBe("errors.csrfInvalid");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not retry other 403s", async () => {
    setCsrfToken("t");
    fetchMock.mockResolvedValueOnce(jsonResponse(403, { errorKey: "errors.adminRequired" }));
    await expect(request("/api/admin/users", { method: "POST", body: {} })).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("localises errors from errorKey with details, then error, then errors.requestFailed", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(409, { errorKey: "errors.materialLimitReached", details: { maxDocuments: 7 }, error: "raw" }))
      .mockResolvedValueOnce(jsonResponse(400, { error: "Invalid status." }))
      .mockResolvedValueOnce(new Response("<html>bad gateway</html>", { status: 502 }));

    const limit = await request("/api/materials").catch((error: unknown) => error);
    expect(limit).toBeInstanceOf(ApiError);
    expect((limit as ApiError).status).toBe(409);
    expect((limit as ApiError).errorKey).toBe("errors.materialLimitReached");
    expect((limit as ApiError).message).toContain("7");

    await expect(request("/api/words/status")).rejects.toThrow("Invalid status.");
    await expect(request("/api/dashboard")).rejects.toThrow("Request failed.");
  });
});

describe("isCsrfRejection", () => {
  it("matches only a 403 with errors.csrfInvalid", () => {
    expect(isCsrfRejection(403, "errors.csrfInvalid")).toBe(true);
    expect(isCsrfRejection(403, "errors.adminRequired")).toBe(false);
    expect(isCsrfRejection(401, "errors.csrfInvalid")).toBe(false);
    expect(isCsrfRejection(403, undefined)).toBe(false);
  });
});

describe("errorMessage", () => {
  it("uses an ApiError's localised message", () => {
    expect(errorMessage(new ApiError(409, { errorKey: "errors.materialLimitReached", details: { maxDocuments: 7 } }))).toContain("7");
  });

  it("falls back to errors.requestFailed, or the given text, for non-API errors", () => {
    expect(errorMessage(new TypeError("Failed to fetch"))).toBe("Request failed.");
    expect(errorMessage("offline")).toBe("Request failed.");
    expect(errorMessage(new Error("boom"), "Could not save.")).toBe("Could not save.");
  });

  it("follows the current locale", () => {
    useLocaleStore.setState({ locale: "ja" });
    expect(errorMessage(null)).not.toBe("Request failed.");
  });
});

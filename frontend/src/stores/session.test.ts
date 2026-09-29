import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as authApi from "@/lib/api/auth";
import { ApiError, getCsrfToken, setCsrfToken } from "@/lib/api/client";
import type { User } from "@/lib/api/types";
import { registerSessionReset, useSessionStore } from "./session";

const USER = { id: 1, email: "a@example.com" } as User;

beforeEach(() => {
  setCsrfToken("session-token");
  useSessionStore.setState({ user: USER, verifyNotice: "" });
});

describe("handleUnauthorized", () => {
  it("drops the user and the CSRF token bound to the expired session", () => {
    useSessionStore.getState().handleUnauthorized();
    expect(useSessionStore.getState().user).toBeNull();
    expect(getCsrfToken()).toBeNull();
  });
});

describe("registerSessionReset", () => {
  it("runs registered resets when the session is cleared or expires", () => {
    const reset = vi.fn();
    registerSessionReset(reset);
    useSessionStore.getState().clearSession();
    expect(reset).toHaveBeenCalledTimes(1);
    useSessionStore.getState().handleUnauthorized();
    expect(reset).toHaveBeenCalledTimes(2);
  });
});

describe("logout", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    [401, "errors.authenticationRequired"],
    [403, "errors.csrfInvalid"]
  ])("clears the session when the session had already expired (%i %s)", async (status, errorKey) => {
    vi.spyOn(authApi, "logout").mockRejectedValue(new ApiError(status, { errorKey }));
    await useSessionStore.getState().logout();
    expect(useSessionStore.getState()).toMatchObject({ user: null, verifyNotice: "" });
  });

  it("keeps the user and shows other failures in the verification banner", async () => {
    vi.spyOn(authApi, "logout").mockRejectedValue(new ApiError(500, { error: "Server error." }));
    await useSessionStore.getState().logout();
    expect(useSessionStore.getState()).toMatchObject({ user: USER, verifyNotice: "Server error." });
  });
});

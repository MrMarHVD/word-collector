import { beforeEach, describe, expect, it } from "vitest";
import { getCsrfToken, setCsrfToken } from "@/lib/api/client";
import type { User } from "@/lib/api/types";
import { useSessionStore } from "./session";

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

import { describe, expect, it } from "vitest";
import { authErrorMessage, needsEmailVerification } from "./auth-status";

describe("authErrorMessage", () => {
  it("uses the error message, or the thrown value as text", () => {
    expect(authErrorMessage(new Error("Invalid email or password."))).toBe("Invalid email or password.");
    expect(authErrorMessage("offline")).toBe("offline");
  });
});

describe("needsEmailVerification", () => {
  it("is true only for a signed-in user without a verified email", () => {
    expect(needsEmailVerification(null)).toBe(false);
    expect(needsEmailVerification({ emailVerified: true })).toBe(false);
    expect(needsEmailVerification({ emailVerified: false })).toBe(true);
  });
});

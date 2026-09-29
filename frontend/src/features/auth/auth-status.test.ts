import { describe, expect, it } from "vitest";
import { needsEmailVerification } from "./auth-status";

describe("needsEmailVerification", () => {
  it("is true only for a signed-in user without a verified email", () => {
    expect(needsEmailVerification(null)).toBe(false);
    expect(needsEmailVerification({ emailVerified: true })).toBe(false);
    expect(needsEmailVerification({ emailVerified: false })).toBe(true);
  });
});

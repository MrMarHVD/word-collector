import { describe, expect, it } from "vitest";
import { accountDetailRows, deleteConfirmationMatches, formatAccountDate } from "./settings-logic";

const t = (key: string) => key;

describe("deleteConfirmationMatches", () => {
  it("matches the email case-insensitively, ignoring surrounding spaces", () => {
    expect(deleteConfirmationMatches("Ann@Example.com", "  ann@example.COM ")).toBe(true);
  });

  it("rejects other text and a missing email", () => {
    expect(deleteConfirmationMatches("ann@example.com", "bob@example.com")).toBe(false);
    expect(deleteConfirmationMatches("", "")).toBe(false);
    expect(deleteConfirmationMatches(null, "ann@example.com")).toBe(false);
  });
});

describe("formatAccountDate", () => {
  it("formats valid dates in the given locale", () => {
    expect(formatAccountDate("2026-01-15T12:00:00Z", "en")).toBe(
      new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date("2026-01-15T12:00:00Z"))
    );
  });

  it("returns null for missing or invalid values", () => {
    expect(formatAccountDate(null, "en")).toBeNull();
    expect(formatAccountDate("not a date", "en")).toBeNull();
  });
});

describe("accountDetailRows", () => {
  it("lists the account fields in the legacy order", () => {
    const rows = accountDetailRows(
      { email: "ann@example.com", displayName: "Ann", createdAt: "", hasGoogle: true, hasPassword: true, emailVerified: true },
      t,
      "en"
    );
    expect(rows).toEqual([
      { labelKey: "settings.accountEmail", value: "ann@example.com" },
      { labelKey: "settings.accountName", value: "Ann" },
      { labelKey: "settings.accountCreatedAt", value: "settings.accountUnknown" },
      { labelKey: "settings.accountSignInMethods", value: "settings.accountGoogle, settings.accountPassword" },
      { labelKey: "settings.accountEmailVerified", value: "settings.accountVerified" }
    ]);
  });

  it("falls back for missing values", () => {
    expect(accountDetailRows(null, t, "en").map((row) => row.value)).toEqual([
      "settings.accountUnknown",
      "settings.accountNotProvided",
      "settings.accountUnknown",
      "settings.accountUnknown",
      "settings.accountNotVerified"
    ]);
  });
});

import { describe, expect, it } from "vitest";
import {
  auditActionKey,
  auditSnapshotKey,
  bytesToMb,
  canEditUser,
  defaultNativeLanguage,
  formatAuditTimestamp,
  isNearListEnd,
  limitInputValues,
  limitsRequest,
  resolveAdminSubtab,
  usersQueryParams
} from "./admin-logic";

const MB = 1024 * 1024;
const regularRow = { id: 2, isAdmin: false, isSuperadmin: false };
const adminRow = { id: 3, isAdmin: true, isSuperadmin: false };

describe("resolveAdminSubtab", () => {
  it("keeps non-superadmins on the admin subtab", () => {
    expect(resolveAdminSubtab("superadmin", false)).toBe("admin");
    expect(resolveAdminSubtab("superadmin", true)).toBe("superadmin");
    expect(resolveAdminSubtab("admin", true)).toBe("admin");
  });
});

describe("canEditUser", () => {
  it("lets the superadmin edit anyone", () => {
    const viewer = { id: 1, isSuperadmin: true };
    expect(canEditUser(viewer, adminRow)).toBe(true);
    expect(canEditUser(viewer, { ...regularRow, id: 1 })).toBe(true);
  });

  it("stops a regular admin at admin rows and their own row", () => {
    const viewer = { id: 2, isSuperadmin: false };
    expect(canEditUser(viewer, adminRow)).toBe(false);
    expect(canEditUser(viewer, { id: 4, isAdmin: false, isSuperadmin: true })).toBe(false);
    expect(canEditUser(viewer, regularRow)).toBe(false);
    expect(canEditUser(viewer, { ...regularRow, id: 5 })).toBe(true);
  });
});

describe("limits", () => {
  it("rounds bytes to whole megabytes", () => {
    expect(bytesToMb(25 * MB)).toBe(25);
    expect(bytesToMb(1.6 * MB)).toBe(2);
  });

  it("shows overrides as input values and no override as empty", () => {
    expect(limitInputValues({ maxMaterialsOverride: 3, maxUploadBytesOverride: 5 * MB })).toEqual({ materials: "3", uploadMb: "5" });
    expect(limitInputValues({ maxMaterialsOverride: null, maxUploadBytesOverride: null })).toEqual({ materials: "", uploadMb: "" });
  });

  it("clears empty fields and converts megabytes to bytes", () => {
    expect(limitsRequest(" 3 ", "")).toEqual({ maxMaterials: 3, maxUploadBytes: null });
    expect(limitsRequest("", "1.5")).toEqual({ maxMaterials: null, maxUploadBytes: Math.round(1.5 * MB) });
  });
});

describe("usersQueryParams", () => {
  it("trims the search and omits empty filters", () => {
    expect(usersQueryParams("email", "  ", "")).toEqual({ sort: "email" });
    expect(usersQueryParams("created_at", " a@b ", "")).toEqual({ sort: "created_at", search: "a@b" });
  });

  it("sends the join-date filter as an ISO timestamp", () => {
    expect(usersQueryParams("email", "", "2024-05-01").createdAfter).toBe(new Date("2024-05-01").toISOString());
  });
});

describe("isNearListEnd", () => {
  it("is true within the threshold of the end", () => {
    expect(isNearListEnd({ scrollHeight: 1000, scrollTop: 790, clientHeight: 100 })).toBe(true);
    expect(isNearListEnd({ scrollHeight: 1000, scrollTop: 700, clientHeight: 100 })).toBe(false);
  });
});

describe("defaultNativeLanguage", () => {
  it("prefers English, else the first option", () => {
    expect(defaultNativeLanguage(["Japanese", "English"])).toBe("English");
    expect(defaultNativeLanguage(["Japanese", "Chinese"])).toBe("Japanese");
    expect(defaultNativeLanguage([])).toBe("English");
  });
});

describe("audit labels", () => {
  it("maps known actions and leaves unknown ones raw", () => {
    expect(auditActionKey("admin.grant")).toBe("admin.superadminActionGrant");
    expect(auditActionKey("admin.revoke")).toBe("admin.superadminActionRevoke");
    expect(auditActionKey("word.setCanonicalTranslation")).toBeNull();
  });

  it("labels admin snapshots", () => {
    expect(auditSnapshotKey({ isAdmin: true })).toBe("admin.superadminSnapshotAdmin");
    expect(auditSnapshotKey({ isAdmin: false })).toBe("admin.superadminSnapshotRegular");
    expect(auditSnapshotKey(null)).toBe("admin.superadminSnapshotNone");
    expect(auditSnapshotKey({ translation: "x" })).toBe("admin.superadminSnapshotNone");
  });

  it("formats timestamps in the UI locale and ignores invalid ones", () => {
    const iso = "2024-05-01T12:34:00.000Z";
    expect(formatAuditTimestamp(iso, "en")).toBe(new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso)));
    expect(formatAuditTimestamp("nope", "en")).toBe("");
    expect(formatAuditTimestamp(null, "en")).toBe("");
  });
});

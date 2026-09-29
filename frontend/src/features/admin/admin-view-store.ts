/**
 * In-memory admin view state that outlives the page (legacy `state.adminSubtab`,
 * `state.adminRail` and the panels' module-level sort and audit page): leaving
 * and re-entering the admin tab restores them, a reload resets them.
 */

import { create } from "zustand";
import type { AdminRail, AdminSubtab, AdminUsersSort } from "./admin-logic";

interface AdminViewState {
  subtab: AdminSubtab;
  rail: AdminRail;
  usersSort: AdminUsersSort;
  auditPage: number;
  setSubtab: (subtab: AdminSubtab) => void;
  setRail: (rail: AdminRail) => void;
  setUsersSort: (sort: AdminUsersSort) => void;
  setAuditPage: (page: number) => void;
}

export const useAdminViewStore = create<AdminViewState>((set) => ({
  subtab: "admin",
  rail: "users",
  usersSort: "email",
  auditPage: 1,
  setSubtab: (subtab) => set({ subtab }),
  setRail: (rail) => set({ rail }),
  setUsersSort: (usersSort) => set({ usersSort }),
  setAuditPage: (auditPage) => set({ auditPage })
}));

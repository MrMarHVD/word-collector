/**
 * @fileoverview Admin feature controller — the delegating seam for the Admin tab.
 *
 * Owns privilege-driven visibility of the Admin tab, the Admin/Superadmin
 * subtabs, and the Users/Words left rail, and delegates panel rendering to the
 * per-panel view-modules. This foundation issue (ADM-001) keeps every panel
 * empty; ADM-002/003/004 fill their own view-modules without editing this file.
 *
 * Privilege source of truth is `state.user.isAdmin` / `state.user.isSuperadmin`,
 * which the backend supplies per request via `/api/auth/me`. The UI gating here
 * is presentational only — the server independently enforces access on every
 * admin route.
 */

import { elements } from "../../dom.js";
import { state } from "../../state.js";
import { renderLocalTabs } from "../../views/components/local-tabs.js";
import { renderAdminSuperadminPanel } from "./admin.superadmin.view.js";
import { renderAdminUsersPanel } from "./admin.users.view.js";
import { renderAdminWordsPanel } from "./admin.words.view.js";

/**
 * Whether the current user may access the Admin tab (admin or superadmin).
 *
 * @returns {boolean}
 */
export function isAdminUser() {
  return Boolean(state.user && (state.user.isAdmin === true || state.user.isSuperadmin === true));
}

/**
 * Whether the current user may access the Superadmin subtab.
 *
 * @returns {boolean}
 */
export function isSuperadminUser() {
  return Boolean(state.user && state.user.isSuperadmin === true);
}

/**
 * Synchronise privilege-gated visibility with the current user. Shows or hides
 * the Admin tab buttons and the Superadmin subtab. Call after the session loads
 * or the menu is (re-)rendered.
 *
 * @sideeffects
 * - Toggles `hidden` on every `.admin-tab-button`.
 * - Toggles `hidden` on the Superadmin subtab button.
 */
export function renderAdminVisibility() {
  const admin = isAdminUser();
  elements.adminTabButtons.forEach((button) => {
    button.hidden = !admin;
  });
  if (elements.adminSuperadminSubtab) {
    elements.adminSuperadminSubtab.hidden = !isSuperadminUser();
  }
}

/**
 * Activate an admin subtab ("admin" or "superadmin"), persisting it to state and
 * showing the matching panel container. Non-superadmins are forced back to the
 * "admin" subtab. Re-renders the active panel via its view-module.
 *
 * @param {"admin"|"superadmin"} subtab - The subtab to activate.
 * @sideeffects Mutates `state.adminSubtab`; toggles subtab buttons and panels.
 */
export function setAdminSubtab(subtab) {
  const next = subtab === "superadmin" && isSuperadminUser() ? "superadmin" : "admin";
  state.adminSubtab = next;
  renderLocalTabs(elements.adminSubtabs, next, { valueAttribute: "data-admin-subtab" });
  elements.adminSubtabPanels.forEach((panel) => {
    panel.hidden = panel.getAttribute("data-admin-subtab-panel") !== next;
  });
  if (next === "superadmin") {
    renderAdminSuperadminPanel();
  } else {
    renderAdminRail(state.adminRail);
  }
}

/**
 * Activate a left-rail entry ("users" or "words") inside the Admin subtab,
 * persisting it to state, showing the matching panel, and delegating rendering
 * to the panel's view-module.
 *
 * @param {"users"|"words"} rail - The rail entry to activate.
 * @sideeffects Mutates `state.adminRail`; toggles rail buttons and panels.
 */
export function renderAdminRail(rail) {
  const next = rail === "words" ? "words" : "users";
  state.adminRail = next;
  renderLocalTabs(elements.adminMenuButtons, next, { valueAttribute: "data-admin-rail" });
  elements.adminRailPanels.forEach((panel) => {
    panel.hidden = panel.getAttribute("data-admin-rail-panel") !== next;
  });
  if (next === "words") {
    renderAdminWordsPanel();
  } else {
    renderAdminUsersPanel();
  }
}

/**
 * Entry point invoked by the router when the Admin tab is activated. Re-applies
 * privilege visibility and renders the current subtab and rail selection.
 *
 * @sideeffects Renders the admin subtab/rail and their panels.
 */
export function enterAdminTab() {
  renderAdminVisibility();
  setAdminSubtab(state.adminSubtab);
}

/**
 * Wire the admin subtab and left-rail click handlers. Call once during startup.
 *
 * @sideeffects Adds `"click"` listeners to the subtab and rail buttons.
 */
export function bindAdminEvents() {
  elements.adminSubtabs.forEach((button) => {
    button.addEventListener("click", () => setAdminSubtab(button.getAttribute("data-admin-subtab")));
  });
  elements.adminMenuButtons.forEach((button) => {
    button.addEventListener("click", () => renderAdminRail(button.getAttribute("data-admin-rail")));
  });
}

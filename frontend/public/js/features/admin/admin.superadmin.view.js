/**
 * @fileoverview Admin "Superadmin" panel view-module.
 *
 * Foundation issue ADM-001 established this view-module as the seam the
 * delegating admin controller calls when the Superadmin subtab is shown. ADM-004
 * delegates the actual rendering and behaviour (grant/revoke + audit log) to
 * `admin.superadmin.controller.js`, keeping this module a thin entry point.
 */

import { elements } from "../../dom.js";
import { renderSuperadminPanel } from "./admin.superadmin.controller.js";

/**
 * Render the Superadmin panel by delegating to the superadmin controller. Clears
 * stale content first so re-entry starts from a clean panel.
 *
 * @returns {void}
 */
export function renderAdminSuperadminPanel() {
  if (!elements.adminSuperadminPanel) {
    return;
  }
  elements.adminSuperadminPanel.replaceChildren();
  renderSuperadminPanel(elements.adminSuperadminPanel);
}

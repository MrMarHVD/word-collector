/**
 * @fileoverview Admin "Words" panel view-module seam.
 *
 * The delegating admin controller renders the Words panel through
 * {@link renderAdminWordsPanel}. Foundation issue ADM-001 left this as an empty
 * placeholder; ADM-003 implements the panel in `admin.words.controller.js` and
 * this module re-exports its render entry point so the admin controller's import
 * contract is unchanged.
 */

export { renderAdminWordsPanel } from "./admin.words.controller.js";

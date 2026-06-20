/**
 * @fileoverview Admin "Users" panel controller.
 *
 * Owns the Users-panel data lifecycle and interactions: keyset-paginated
 * infinite scroll, email search, account-creation-date filter, creation-date
 * sort toggle, and the inline set/clear of each user's two material-limit
 * overrides. Privilege gating of the edit controls is presentational only — the
 * server independently rejects an unauthorised edit with 403.
 *
 * Rendering of the panel skeleton and rows lives in `admin.users.view.js`; this
 * controller mutates a small module-local model and asks the view to repaint.
 */

import { requestJson } from "../../api.js";
import { state } from "../../state.js";
import { t } from "../../i18n.js";
import { renderUsersPanelSkeleton, renderUsersRows, setUsersStatus } from "./admin.users.view.js";

// Module-local model for the Users panel. Kept here (not in global `state`) so
// the panel is self-contained and re-entry resets cleanly.
const model = {
  users: [],
  search: "",
  sort: "email",
  createdAfter: "",
  nextCursor: null,
  loading: false
};

const SEARCH_DEBOUNCE_MS = 200;
let searchDebounceId = null;

/**
 * Whether the current user may edit the given row. A regular admin may not edit
 * an admin row or their own account; the superadmin may edit anyone. This is the
 * cosmetic mirror of the server-side guard.
 *
 * @param {object} row - A user row from the list.
 * @returns {boolean}
 */
export function canEditUser(row) {
  if (state.user?.isSuperadmin === true) {
    return true;
  }
  const isSelf = state.user?.userId === row.id || state.user?.id === row.id;
  return !row.isAdmin && !row.isSuperadmin && !isSelf;
}

// Build the query string for the current model state, including the keyset
// cursor when paging beyond the first page.
function buildQuery(reset) {
  const params = new URLSearchParams({ sort: model.sort });
  if (model.search.trim()) {
    params.set("search", model.search.trim());
  }
  if (model.createdAfter) {
    params.set("createdAfter", new Date(model.createdAfter).toISOString());
  }
  if (!reset && model.nextCursor) {
    params.set("cursorValue", model.nextCursor.value);
    params.set("cursorId", String(model.nextCursor.id));
  }
  return params.toString();
}

/**
 * Load a page of users. With `reset`, discards the current list and fetches the
 * first page; otherwise appends the next keyset page. No-ops while a request is
 * in flight or when there is no further page to append.
 *
 * @param {boolean} [reset=false]
 * @returns {Promise<void>}
 */
export async function loadUsers(reset = false) {
  if (model.loading) {
    return;
  }
  if (!reset && !model.nextCursor) {
    return;
  }
  model.loading = true;
  try {
    const result = await requestJson(`/api/admin/users?${buildQuery(reset)}`);
    model.users = reset ? result.users : model.users.concat(result.users);
    model.nextCursor = result.nextCursor || null;
    renderUsersRows(model.users, { hasMore: Boolean(model.nextCursor) });
  } catch (error) {
    setUsersStatus(error.message);
  } finally {
    model.loading = false;
  }
}

/**
 * Set or clear a single user's material-limit overrides, then refresh that row
 * in place from the server response. An empty value clears that override.
 *
 * @param {number} userId
 * @param {{ maxMaterials: string|number|null, maxUploadBytes: string|number|null }} updates
 * @returns {Promise<void>}
 */
export async function submitUserLimits(userId, updates) {
  try {
    const result = await requestJson(`/api/admin/users/${userId}/limits`, {
      method: "POST",
      body: JSON.stringify(updates)
    });
    model.users = model.users.map((row) => (row.id === userId ? { ...row, ...result.user } : row));
    renderUsersRows(model.users, { hasMore: Boolean(model.nextCursor) });
    setUsersStatus(t("admin.usersLimitsSaved"));
  } catch (error) {
    setUsersStatus(error.message);
  }
}

// Wire the panel's controls. Called after every skeleton render: the view
// rebuilds the control elements each entry, so listeners are attached to the
// fresh nodes (the old nodes are discarded, so nothing leaks).
function bindEvents(container) {
  const search = container.querySelector("[data-admin-users-search]");
  search?.addEventListener("input", () => {
    model.search = search.value;
    window.clearTimeout(searchDebounceId);
    searchDebounceId = window.setTimeout(() => loadUsers(true), SEARCH_DEBOUNCE_MS);
  });

  const createdAfter = container.querySelector("[data-admin-users-created-after]");
  createdAfter?.addEventListener("change", () => {
    model.createdAfter = createdAfter.value;
    loadUsers(true);
  });

  const sortToggle = container.querySelector("[data-admin-users-sort]");
  sortToggle?.addEventListener("click", () => {
    model.sort = model.sort === "email" ? "created_at" : "email";
    sortToggle.textContent = model.sort === "created_at" ? t("admin.usersSortByDate") : t("admin.usersSortByEmail");
    loadUsers(true);
  });

  const list = container.querySelector("[data-admin-users-list]");
  list?.addEventListener("scroll", () => {
    const remaining = list.scrollHeight - list.scrollTop - list.clientHeight;
    if (remaining < 120) {
      loadUsers(false);
    }
  });

  list?.addEventListener("submit", (event) => {
    const form = event.target.closest("[data-admin-user-limits-form]");
    if (!form) {
      return;
    }
    event.preventDefault();
    const userId = Number(form.dataset.userId);
    const materials = form.querySelector("[data-limit-materials]").value.trim();
    const uploadMb = form.querySelector("[data-limit-upload-mb]").value.trim();
    submitUserLimits(userId, {
      maxMaterials: materials === "" ? null : Number(materials),
      maxUploadBytes: uploadMb === "" ? null : Math.round(Number(uploadMb) * 1024 * 1024)
    });
  });

  list?.addEventListener("click", (event) => {
    const clearButton = event.target.closest("[data-admin-user-clear]");
    if (!clearButton) {
      return;
    }
    submitUserLimits(Number(clearButton.dataset.userId), { maxMaterials: null, maxUploadBytes: null });
  });
}

/**
 * Entry point invoked by the view when the Users panel is shown. Paints the
 * skeleton, wires events once, resets the model, and loads the first page.
 *
 * @param {HTMLElement} container - The Users panel root element.
 * @returns {void}
 */
export function enterUsersPanel(container) {
  model.users = [];
  model.nextCursor = null;
  model.search = "";
  model.createdAfter = "";
  renderUsersPanelSkeleton(container, { sort: model.sort });
  bindEvents(container);
  loadUsers(true);
}

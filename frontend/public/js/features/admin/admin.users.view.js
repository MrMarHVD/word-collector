/**
 * @fileoverview Admin "Users" panel view-module.
 *
 * Renders the Users panel: search/filter/sort controls, the infinite-scrolling
 * user list, and per-row inline controls to set or clear a user's two
 * material-limit overrides. Pure rendering — all data loading and interaction
 * logic lives in `admin.users.controller.js`, which this module delegates to via
 * `renderAdminUsersPanel`. Edit controls are disabled on rows the current admin
 * may not edit (the server enforces the same rule).
 */

import { elements } from "../../dom.js";
import { escapeHtml } from "../../shared/html.js";
import { formatCount, t } from "../../i18n.js";
import { canEditUser, enterUsersPanel } from "./admin.users.controller.js";

const BYTES_PER_MB = 1024 * 1024;

// Format an effective upload-byte limit as a whole number of megabytes.
function bytesToMb(bytes) {
  return Math.round(Number(bytes) / BYTES_PER_MB);
}

// Format an ISO timestamp as a locale-aware date for the row's created column.
function formatDate(iso) {
  return iso ? new Date(iso).toLocaleDateString() : "";
}

/**
 * Render the Admin → Users panel by delegating to the controller, which paints
 * the skeleton, wires events, and loads the first page.
 *
 * @returns {void}
 */
export function renderAdminUsersPanel() {
  if (!elements.adminUsersPanel) {
    return;
  }
  enterUsersPanel(elements.adminUsersPanel);
}

/**
 * Paint the static Users-panel skeleton (controls + empty list + status line)
 * into the container. Called once per panel entry.
 *
 * @param {HTMLElement} container - The Users panel root element.
 * @param {{ sort: "email"|"created_at" }} options - Current sort, for the toggle label.
 * @returns {void}
 */
export function renderUsersPanelSkeleton(container, { sort }) {
  const sortLabel = sort === "created_at" ? t("admin.usersSortByDate") : t("admin.usersSortByEmail");
  container.innerHTML = `
    <div class="grid gap-4">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label class="grid flex-1 gap-1.5 text-sm font-semibold text-label">
          <span>${escapeHtml(t("admin.usersSearchLabel"))}</span>
          <input class="min-h-11 rounded-md border border-line bg-panel px-3 text-main outline-none focus:border-brand focus:ring-2 focus:ring-focus" type="search" autocomplete="off" spellcheck="false" data-admin-users-search placeholder="${escapeHtml(t("admin.usersSearchPlaceholder"))}" />
        </label>
        <label class="grid gap-1.5 text-sm font-semibold text-label">
          <span>${escapeHtml(t("admin.usersCreatedAfterLabel"))}</span>
          <input class="min-h-11 rounded-md border border-line bg-panel px-3 text-main outline-none focus:border-brand focus:ring-2 focus:ring-focus" type="date" data-admin-users-created-after />
        </label>
        <button class="min-h-11 rounded-md border border-line bg-panel px-4 text-sm font-bold text-brand hover:bg-hover" type="button" data-admin-users-sort>${escapeHtml(sortLabel)}</button>
      </div>
      <div class="admin-users-list grid max-h-[28rem] gap-2 overflow-y-auto" data-admin-users-list></div>
      <p class="status min-h-5 text-sm text-secondary" role="status" data-admin-users-status></p>
    </div>
  `;
}

// Build the inline limits form (or a disabled placeholder) for a single row.
function renderRowControls(row) {
  const editable = canEditUser(row);
  const materialsValue = row.maxMaterialsOverride == null ? "" : String(row.maxMaterialsOverride);
  const uploadMbValue = row.maxUploadBytesOverride == null ? "" : String(bytesToMb(row.maxUploadBytesOverride));
  const disabled = editable ? "" : "disabled";
  return `
    <form class="flex flex-wrap items-end gap-2" data-admin-user-limits-form data-user-id="${row.id}">
      <label class="grid gap-1 text-xs font-semibold text-label">
        <span>${escapeHtml(t("admin.usersMaxMaterials"))}</span>
        <input class="h-9 w-24 rounded-md border border-line bg-panel px-2 text-sm text-main outline-none focus:border-brand focus:ring-2 focus:ring-focus" type="number" min="0" step="1" inputmode="numeric" data-limit-materials value="${escapeHtml(materialsValue)}" placeholder="${escapeHtml(t("admin.usersDefaultPlaceholder"))}" ${disabled} />
      </label>
      <label class="grid gap-1 text-xs font-semibold text-label">
        <span>${escapeHtml(t("admin.usersMaxUploadMb"))}</span>
        <input class="h-9 w-24 rounded-md border border-line bg-panel px-2 text-sm text-main outline-none focus:border-brand focus:ring-2 focus:ring-focus" type="number" min="0" step="1" inputmode="numeric" data-limit-upload-mb value="${escapeHtml(uploadMbValue)}" placeholder="${escapeHtml(t("admin.usersDefaultPlaceholder"))}" ${disabled} />
      </label>
      <button class="h-9 rounded-md bg-brand px-3 text-sm font-bold text-white hover:bg-brand-strong disabled:opacity-50" type="submit" ${disabled}>${escapeHtml(t("admin.usersSaveLimits"))}</button>
      <button class="h-9 rounded-md border border-line bg-panel px-3 text-sm font-bold text-brand hover:bg-hover disabled:opacity-50" type="button" data-admin-user-clear data-user-id="${row.id}" ${disabled}>${escapeHtml(t("admin.usersClearLimits"))}</button>
    </form>
  `;
}

// Build one user row, including identity, status badge, effective limits, and
// count, plus the inline edit controls.
function renderRow(row) {
  const adminBadge = row.isSuperadmin
    ? `<span class="rounded-full bg-muted px-2 py-0.5 text-xs font-bold text-brand">${escapeHtml(t("admin.usersSuperadminBadge"))}</span>`
    : row.isAdmin
      ? `<span class="rounded-full bg-muted px-2 py-0.5 text-xs font-bold text-brand">${escapeHtml(t("admin.usersAdminBadge"))}</span>`
      : "";
  return `
    <div class="grid gap-2 rounded-md border border-line bg-muted p-3">
      <div class="flex flex-wrap items-center gap-2">
        <span class="min-w-0 flex-1 truncate font-semibold text-main">${escapeHtml(row.email)}</span>
        ${adminBadge}
        <span class="text-xs text-secondary">${escapeHtml(t("admin.usersCreatedOn", { date: formatDate(row.createdAt) }))}</span>
      </div>
      <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-secondary">
        <span>${escapeHtml(t("admin.usersEffectiveMaterials", { count: formatCount(row.maxMaterials) }))}</span>
        <span>${escapeHtml(t("admin.usersEffectiveUpload", { mb: formatCount(bytesToMb(row.maxUploadBytes)) }))}</span>
        <span>${escapeHtml(t("admin.usersMaterialCount", { count: formatCount(row.materialCount) }))}</span>
      </div>
      ${renderRowControls(row)}
    </div>
  `;
}

/**
 * Repaint the user list with the current rows. Shows an empty-state message when
 * there are no rows.
 *
 * @param {object[]} rows - The accumulated user rows.
 * @param {{ hasMore: boolean }} [options] - Whether a further page exists.
 * @returns {void}
 */
export function renderUsersRows(rows, { hasMore = false } = {}) {
  const list = elements.adminUsersPanel?.querySelector("[data-admin-users-list]");
  if (!list) {
    return;
  }
  if (!rows.length) {
    list.innerHTML = `<p class="p-3 text-sm text-secondary">${escapeHtml(t("admin.usersEmpty"))}</p>`;
    return;
  }
  const moreHint = hasMore ? `<p class="p-2 text-center text-xs text-secondary">${escapeHtml(t("admin.usersScrollForMore"))}</p>` : "";
  list.innerHTML = rows.map(renderRow).join("") + moreHint;
}

/**
 * Write a transient status/error message into the panel's status line.
 *
 * @param {string} message
 * @returns {void}
 */
export function setUsersStatus(message) {
  const status = elements.adminUsersPanel?.querySelector("[data-admin-users-status]");
  if (status) {
    status.textContent = message;
  }
}

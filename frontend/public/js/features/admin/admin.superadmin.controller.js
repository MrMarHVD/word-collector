/**
 * @fileoverview Superadmin subtab controller (ADM-004).
 *
 * Owns the behaviour of the Superadmin panel: grant/revoke of the admin flag by
 * email and a read-only, paginated view of the admin audit log. It is invoked by
 * the panel's view-module (`admin.superadmin.view.js`), which the delegating
 * admin controller calls when the Superadmin subtab is shown.
 *
 * Server access is independently enforced (superadmin-only, 403 otherwise); the
 * UI here is presentational. There is deliberately no control for clearing the
 * superadmin's own flag — that tier is immutable through the API and the UI.
 */

import { requestJson } from "../../api.js";
import { t } from "../../i18n.js";
import { escapeHtml } from "../../shared/html.js";
import { state } from "../../state.js";

/** Current audit-log page being viewed (1-based). */
let auditPage = 1;

/**
 * Build the static markup for the Superadmin panel: the grant/revoke controls
 * and the audit-log container the list is rendered into.
 *
 * @returns {string} HTML string for the panel body.
 */
function panelMarkup() {
  return `
    <div class="grid gap-6">
      <section class="grid gap-3">
        <div class="grid gap-1">
          <h2 class="text-sm font-bold text-main">${escapeHtml(t("admin.superadminManageTitle"))}</h2>
          <p class="text-sm text-secondary">${escapeHtml(t("admin.superadminManageDescription"))}</p>
        </div>
        <form id="superadminGrantForm" class="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label class="grid flex-1 gap-1.5 text-sm font-semibold text-label">
            <span>${escapeHtml(t("admin.superadminEmailLabel"))}</span>
            <input id="superadminEmailInput" class="min-h-11 rounded-md border border-line bg-panel px-3 text-main outline-none focus:border-brand focus:ring-2 focus:ring-focus" type="email" autocomplete="off" spellcheck="false" required placeholder="${escapeHtml(t("admin.superadminEmailPlaceholder"))}" />
          </label>
          <div class="flex gap-2">
            <button id="superadminGrantButton" class="min-h-11 rounded-md bg-brand px-4 text-sm font-bold text-white outline-none focus:ring-2 focus:ring-focus" type="submit">${escapeHtml(t("admin.superadminGrantButton"))}</button>
            <button id="superadminRevokeButton" class="min-h-11 rounded-md border border-line bg-muted px-4 text-sm font-bold text-main outline-none focus:ring-2 focus:ring-focus" type="button">${escapeHtml(t("admin.superadminRevokeButton"))}</button>
          </div>
        </form>
        <p id="superadminStatus" class="status min-h-5 text-sm text-secondary" role="status"></p>
      </section>

      <section class="grid gap-3">
        <div class="grid gap-1">
          <h2 class="text-sm font-bold text-main">${escapeHtml(t("admin.superadminAuditTitle"))}</h2>
          <p class="text-sm text-secondary">${escapeHtml(t("admin.superadminAuditDescription"))}</p>
        </div>
        <div id="superadminAuditLog"></div>
      </section>
    </div>
  `;
}

/**
 * Localise a stored audit action key into a human label, falling back to the
 * raw action identifier when unknown.
 *
 * @param {string} action - Stored action identifier, e.g. `"admin.grant"`.
 * @returns {string}
 */
function actionLabel(action) {
  const map = { "admin.grant": "admin.superadminActionGrant", "admin.revoke": "admin.superadminActionRevoke" };
  return map[action] ? t(map[action]) : action;
}

/**
 * Format an audit row's `before`/`after` admin snapshots for display.
 *
 * @param {{ isAdmin?: boolean }|null|undefined} value - Stored snapshot.
 * @returns {string}
 */
function formatSnapshot(value) {
  if (!value || typeof value !== "object" || value.isAdmin === undefined) {
    return t("admin.superadminSnapshotNone");
  }
  return value.isAdmin ? t("admin.superadminSnapshotAdmin") : t("admin.superadminSnapshotRegular");
}

/**
 * Format an ISO timestamp using the active locale.
 *
 * @param {string} value
 * @returns {string}
 */
function formatTimestamp(value) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat(state.locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

/**
 * Render a single page of audit-log data into the log container.
 *
 * @param {{ entries: Array<object>, page: number, totalPages: number, total: number }} data
 * @returns {void}
 */
function renderAuditLog(data) {
  const container = document.querySelector("#superadminAuditLog");
  if (!container) {
    return;
  }

  if (!data.entries.length) {
    container.innerHTML = `<p class="text-sm text-secondary">${escapeHtml(t("admin.superadminAuditEmpty"))}</p>`;
    return;
  }

  const rows = data.entries
    .map(
      (entry) => `
        <li class="grid gap-1 rounded-md border border-line bg-muted px-3 py-2">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <span class="font-semibold text-main">${escapeHtml(actionLabel(entry.action))}</span>
            <span class="text-xs text-secondary">${escapeHtml(formatTimestamp(entry.createdAt))}</span>
          </div>
          <div class="text-xs text-secondary">${escapeHtml(t("admin.superadminAuditActor", { actor: entry.actorEmail || t("admin.superadminAuditUnknownActor") }))}</div>
          <div class="text-xs text-secondary">${escapeHtml(t("admin.superadminAuditTarget", { target: entry.target || t("admin.superadminSnapshotNone") }))}</div>
          <div class="text-xs text-secondary">${escapeHtml(t("admin.superadminAuditChange", { before: formatSnapshot(entry.before), after: formatSnapshot(entry.after) }))}</div>
        </li>
      `
    )
    .join("");

  container.innerHTML = `
    <ul class="grid gap-2">${rows}</ul>
    <div class="mt-3 flex items-center justify-between gap-2">
      <button id="superadminAuditPrev" class="min-h-9 rounded-md border border-line bg-muted px-3 text-sm font-semibold text-main outline-none focus:ring-2 focus:ring-focus disabled:opacity-50" type="button" ${data.page <= 1 ? "disabled" : ""}>${escapeHtml(t("admin.superadminAuditPrev"))}</button>
      <span class="text-xs text-secondary">${escapeHtml(t("admin.superadminAuditPageInfo", { page: data.page, totalPages: data.totalPages }))}</span>
      <button id="superadminAuditNext" class="min-h-9 rounded-md border border-line bg-muted px-3 text-sm font-semibold text-main outline-none focus:ring-2 focus:ring-focus disabled:opacity-50" type="button" ${data.page >= data.totalPages ? "disabled" : ""}>${escapeHtml(t("admin.superadminAuditNext"))}</button>
    </div>
  `;

  const prev = container.querySelector("#superadminAuditPrev");
  const next = container.querySelector("#superadminAuditNext");
  if (prev) {
    prev.addEventListener("click", () => loadAuditLog(data.page - 1));
  }
  if (next) {
    next.addEventListener("click", () => loadAuditLog(data.page + 1));
  }
}

/**
 * Fetch and render the requested audit-log page.
 *
 * @param {number} [page=1] - 1-based page number.
 * @returns {Promise<void>}
 */
async function loadAuditLog(page = 1) {
  const container = document.querySelector("#superadminAuditLog");
  try {
    const data = await requestJson(`/api/admin/superadmin/audit?page=${encodeURIComponent(page)}`);
    auditPage = data.page;
    renderAuditLog(data);
  } catch (error) {
    if (container) {
      container.innerHTML = `<p class="text-sm text-danger">${escapeHtml(error.message)}</p>`;
    }
  }
}

/**
 * Submit a grant or revoke request for the email currently in the input, then
 * report the outcome and refresh the audit log.
 *
 * @param {"grant"|"revoke"} action - Which mutation to perform.
 * @returns {Promise<void>}
 */
async function submitMutation(action) {
  const input = document.querySelector("#superadminEmailInput");
  const status = document.querySelector("#superadminStatus");
  const email = String(input?.value || "").trim();
  if (!email) {
    return;
  }
  try {
    const result = await requestJson(`/api/admin/superadmin/${action}`, {
      method: "POST",
      body: JSON.stringify({ email })
    });
    if (status) {
      const key = action === "grant" ? "admin.superadminGrantSuccess" : "admin.superadminRevokeSuccess";
      status.textContent = t(key, { email: result.user.email });
      status.classList.remove("text-danger");
      status.classList.add("text-secondary");
    }
    await loadAuditLog(1);
  } catch (error) {
    if (status) {
      status.textContent = error.message;
      status.classList.remove("text-secondary");
      status.classList.add("text-danger");
    }
  }
}

/**
 * Render the Superadmin panel into the given container and wire its controls.
 * Called by the panel view-module each time the subtab is shown.
 *
 * @param {HTMLElement} container - The `#adminSuperadminPanel` element.
 * @returns {void}
 */
export function renderSuperadminPanel(container) {
  container.innerHTML = panelMarkup();

  const form = container.querySelector("#superadminGrantForm");
  const revokeButton = container.querySelector("#superadminRevokeButton");
  if (form) {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      submitMutation("grant");
    });
  }
  if (revokeButton) {
    revokeButton.addEventListener("click", () => submitMutation("revoke"));
  }

  loadAuditLog(auditPage);
}

import { t } from "../../i18n.js";
import { escapeHtml } from "../../shared/html.js";
import { state } from "../../state.js";

function hasOverride(entry) {
  return typeof entry.translationOverride === "string" && entry.translationOverride.trim().length > 0;
}

function editIcon() {
  return `
    <svg aria-hidden="true" viewBox="0 0 24 24" class="material-action-icon">
      <path d="M4 20h4l11-11a2.8 2.8 0 0 0-4-4L4 16v4Z" />
      <path d="M13.5 6.5l4 4" />
    </svg>
  `;
}

function clearIcon() {
  return `
    <svg aria-hidden="true" viewBox="0 0 24 24" class="material-action-icon">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  `;
}

export function renderTranslationOverrideControls(entry, { context, compact = false } = {}) {
  const editing = state.translationOverrideEditWordId === entry.wordId || state.translationOverrideEditWordId === entry.id;
  const activeContext = state.translationOverrideEditContext === context;
  const wordId = entry.wordId || entry.id;
  const translation = entry.translation || t("reader.noTranslation");
  const inputValue = hasOverride(entry) ? entry.translationOverride : entry.translation || "";
  if (editing && activeContext) {
    return `
      <form class="translation-override-form${compact ? " is-compact" : ""}" data-translation-override-form data-word-id="${wordId}">
        <input class="translation-override-input" name="translationOverride" value="${escapeHtml(inputValue)}" placeholder="${escapeHtml(t("translation.overridePlaceholder"))}" aria-label="${escapeHtml(t("translation.overrideInput"))}" autocomplete="off" />
        <button class="secondary-button translation-override-save" type="submit">${escapeHtml(t("translation.save"))}</button>
        <button class="material-icon-button material-delete-button translation-override-cancel" type="button" data-translation-override-cancel data-word-id="${wordId}" aria-label="${escapeHtml(t("translation.cancel"))}" title="${escapeHtml(t("translation.cancel"))}">
          ${clearIcon()}
        </button>
      </form>
    `;
  }
  return `
    <div class="translation-override-display${compact ? " is-compact" : ""}">
      <span class="translation-override-text${hasOverride(entry) ? " is-overridden" : ""}">${escapeHtml(translation)}</span>
      <span class="translation-override-actions">
        <button class="material-icon-button material-rename-button translation-override-edit" type="button" data-translation-override-edit data-word-id="${wordId}" data-translation-context="${escapeHtml(context)}" aria-label="${escapeHtml(t("translation.edit"))}" title="${escapeHtml(t("translation.edit"))}">
          ${editIcon()}
        </button>
        ${hasOverride(entry) ? `<button class="material-icon-button material-delete-button translation-override-clear" type="button" data-translation-override-clear data-word-id="${wordId}" aria-label="${escapeHtml(t("translation.clearOverride"))}" title="${escapeHtml(t("translation.clearOverride"))}">
          ${clearIcon()}
        </button>` : ""}
      </span>
    </div>
  `;
}

export function hasTranslationOverride(entry) {
  return hasOverride(entry);
}

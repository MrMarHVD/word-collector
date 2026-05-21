import { elements } from "../dom.js";
import { t } from "../i18n.js";
import { escapeHtml } from "../shared/html.js";

export function renderOnboarding(predefinedLanguages) {
  elements.onboardingLanguages.innerHTML = predefinedLanguages.length
    ? predefinedLanguages
        .map((language) => `<button class="language-pick" type="button" data-predefined-language-id="${language.id}">${escapeHtml(language.name)}</button>`)
        .join("")
    : `<p class="empty">${escapeHtml(t("onboarding.noLanguages"))}</p>`;
}

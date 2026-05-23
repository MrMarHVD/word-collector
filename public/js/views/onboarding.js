import { elements } from "../dom.js";
import { t } from "../i18n.js";
import { escapeHtml } from "../shared/html.js";

// Onboarding starts users with one of the predefined study languages.
// Render language selection buttons for the onboarding screen.
export function renderOnboarding(predefinedLanguages) {
  elements.onboardingLanguages.innerHTML = predefinedLanguages.length
    ? predefinedLanguages
        .map(
          (language) =>
            `<button class="language-pick min-h-11 rounded-md border border-line bg-white px-4 text-sm font-bold text-ink hover:border-teal-200 hover:bg-teal-50" type="button" data-language-name="${escapeHtml(language.name)}">${escapeHtml(language.name)}</button>`
        )
        .join("")
    : `<p class="empty">${escapeHtml(t("onboarding.noLanguages"))}</p>`;
}

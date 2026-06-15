/**
 * @fileoverview Onboarding view — renders the first-run language selection
 * screen where a new user picks a study language from the server's predefined
 * list before entering the main application shell.
 */

import { elements } from "../dom.js";
import { t } from "../i18n.js";
import { escapeHtml } from "../shared/html.js";

/**
 * Populates the onboarding language picker with one button per predefined
 * language. When the list is empty, a localized empty-state message is shown
 * instead.
 *
 * @param {Array<{name: string}>} predefinedLanguages - The languages available
 *   for new users to choose from, as returned by the server.
 *
 * @sideeffects
 * - Replaces `elements.onboardingLanguages.innerHTML` with rendered button or
 *   empty-state markup. Each button carries a `data-language-name` attribute
 *   used by the application event layer to set the study language.
 */
export function renderOnboarding(predefinedLanguages) {
  elements.onboardingLanguages.innerHTML = predefinedLanguages.length
    ? predefinedLanguages
        .map(
          (language) =>
            `<button class="language-pick min-h-11 rounded-md border border-line bg-panel px-4 text-sm font-bold text-main hover:border-brand hover:bg-hover" type="button" data-language-name="${escapeHtml(language.name)}">${escapeHtml(language.name)}</button>`
        )
        .join("")
    : `<p class="empty">${escapeHtml(t("onboarding.noLanguages"))}</p>`;
}

import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { refreshStudyData } from "@/lib/api/queries";
import { useT } from "@/lib/i18n";
import { availableStudyLanguages, firstAvailableStudyLanguageAlphabetically, studyLanguageLabelKey } from "@/lib/study-language";
import { cn } from "@/lib/utils";
import { useSessionStore } from "@/stores/session";
import { useStudyLanguageStore } from "@/stores/study-language";
import { THEME_PREFERENCES, useThemeStore } from "@/stores/theme";
import { useUiPreferencesStore, type WordDisplayMode } from "@/stores/ui-preferences";

const THEME_LABEL_KEYS = { system: "settings.themeSystem", light: "settings.themeLight", dark: "settings.themeDark" } as const;
const DISPLAY_MODE_LABEL_KEYS: Record<WordDisplayMode, string> = { page: "collections.displayPage", infinite: "collections.displayInfinite" };
const SEGMENT_CLASS = "rounded-md px-3 py-2 text-sm font-semibold text-secondary";

/**
 * The "System" panel (#settingsForm): native language (saved with the form),
 * plus the word display mode (mobile only) and theme, which apply at once.
 */
export function SystemSettingsPanel({ hidden }: { hidden: boolean }) {
  const t = useT();
  const queryClient = useQueryClient();
  const user = useSessionStore((state) => state.user);
  const nativeLanguageOptions = useSessionStore((state) => state.nativeLanguageOptions);
  const setUser = useSessionStore((state) => state.setUser);
  const themePreference = useThemeStore((state) => state.preference);
  const setTheme = useThemeStore((state) => state.setTheme);
  const wordDisplayMode = useUiPreferencesStore((state) => state.wordDisplayMode);
  const setWordDisplayMode = useUiPreferencesStore((state) => state.setWordDisplayMode);
  const [nativeLanguage, setNativeLanguage] = useState(user?.nativeLanguage ?? "");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  // Ported from the legacy settings form submit: save, then fall back the study language when it became unavailable.
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) {
      return;
    }
    setStatus(t("settings.saving"));
    setSaving(true);
    try {
      const result = await api.settings.update({ nativeLanguage, activeStudyLanguage: useStudyLanguageStore.getState().selectedName });
      setUser({ ...user, ...result.user });
      if (result.nativeLanguageOptions) {
        useSessionStore.setState({ nativeLanguageOptions: result.nativeLanguageOptions });
      }
      setNativeLanguage(result.user.nativeLanguage);
      const { studyLanguageOptions, languages, nativeLanguage: savedNativeLanguage, selectedName, selectLanguage } = useStudyLanguageStore.getState();
      const label = (name: string) => t(studyLanguageLabelKey(name));
      if (!availableStudyLanguages(studyLanguageOptions, languages, savedNativeLanguage).some((language) => language.name === selectedName)) {
        const replacement = firstAvailableStudyLanguageAlphabetically(studyLanguageOptions, languages, savedNativeLanguage, label);
        selectLanguage(replacement?.name || "", { persist: true });
        setStatus(replacement ? t("settings.savedStudyLanguageChanged", { language: label(replacement.name) }) : t("settings.savedNoStudyLanguage"));
      } else {
        setStatus(t("settings.saved"));
      }
      await refreshStudyData(queryClient);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="settings-panel rounded-lg border border-line bg-panel p-5 shadow-panel" data-settings-panel="system" hidden={hidden}>
      <div className="section-head mb-4 flex min-h-8 items-center justify-between gap-3">
        <h2 className="text-base font-bold">{t("settings.title")}</h2>
      </div>
      <form id="settingsForm" onSubmit={handleSubmit}>
        <label className="grid gap-1.5 text-sm font-semibold text-label">
          <span>{t("settings.nativeLanguage")}</span>
          <select
            id="nativeLanguageSelect"
            className="min-h-11 rounded-md border border-line bg-panel px-3 text-main outline-none focus:border-brand focus:ring-2 focus:ring-focus"
            value={nativeLanguage}
            onChange={(event) => setNativeLanguage(event.target.value)}
          >
            {nativeLanguageOptions.map((language) => (
              <option key={language} value={language}>
                {t(`settings.nativeLanguage.${language}`)}
              </option>
            ))}
          </select>
        </label>
        <p className="hint mt-3 min-h-5 text-sm text-secondary">{t("settings.nativeLanguageHint")}</p>
        <fieldset className="settings-display-mode mt-4 grid gap-2">
          <legend className="text-sm font-semibold text-label">{t("collections.displayMode")}</legend>
          <div className="display-mode-buttons grid grid-cols-2 gap-1 rounded-lg border border-line bg-muted p-1">
            {(["page", "infinite"] as const).map((mode) => (
              <button
                key={mode}
                className={cn("display-mode-button", SEGMENT_CLASS, wordDisplayMode === mode && "is-active")}
                type="button"
                data-display-mode={mode}
                aria-pressed={wordDisplayMode === mode}
                onClick={() => setWordDisplayMode(mode)}
              >
                {t(DISPLAY_MODE_LABEL_KEYS[mode])}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset className="mt-4 grid gap-2">
          <legend className="text-sm font-semibold text-label">{t("settings.theme")}</legend>
          <div className="theme-buttons grid grid-cols-3 gap-1 rounded-lg border border-line bg-muted p-1 max-sm:grid-cols-1">
            {THEME_PREFERENCES.map((theme) => (
              <button
                key={theme}
                className={cn("theme-button", SEGMENT_CLASS, themePreference === theme && "is-active")}
                type="button"
                data-theme-option={theme}
                aria-pressed={themePreference === theme}
                onClick={() => setTheme(theme)}
              >
                {t(THEME_LABEL_KEYS[theme])}
              </button>
            ))}
          </div>
        </fieldset>
        <button className="mt-2 min-h-11 rounded-md bg-brand px-4 text-sm font-bold text-white hover:bg-brand-strong" type="submit" disabled={saving}>
          {t("settings.save")}
        </button>
        <p id="settingsStatus" className="status mt-3 min-h-5 text-sm text-secondary" role="status">
          {status}
        </p>
      </form>
    </section>
  );
}

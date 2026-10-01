import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Segmented } from "@/components/app/Segmented";
import { SettingRow, SettingSection } from "@/components/app/SettingRow";
import { toast } from "@/components/app/toast";
import { api, errorMessage } from "@/lib/api";
import { refreshStudyData } from "@/lib/api/queries";
import { useT } from "@/lib/i18n";
import { availableStudyLanguages, firstAvailableStudyLanguageAlphabetically, studyLanguageLabelKey } from "@/lib/study-language";
import { useSessionStore } from "@/stores/session";
import { useStudyLanguageStore } from "@/stores/study-language";
import { THEME_PREFERENCES, useThemeStore } from "@/stores/theme";
import { useUiPreferencesStore, type WordDisplayMode } from "@/stores/ui-preferences";

const THEME_LABEL_KEYS = { system: "settings.themeSystem", light: "settings.themeLight", dark: "settings.themeDark" } as const;
const DISPLAY_MODE_LABEL_KEYS: Record<WordDisplayMode, string> = { page: "collections.displayPage", infinite: "collections.displayInfinite" };

/**
 * The "System" panel: native language, theme and the word display mode
 * (mobile only). Every control saves or applies on change; the outcome shows as a
 * toast and in the visually hidden #settingsStatus.
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

  /** Reports a save outcome in the hidden status element and as a toast. */
  function report(message: string, failed = false) {
    setStatus(message);
    (failed ? toast.error : toast.success)(message);
  }

  // Ported from the legacy settings form submit: save, then fall back the study language when it became unavailable.
  async function saveNativeLanguage(next: string) {
    if (!user) {
      return;
    }
    setNativeLanguage(next);
    setStatus(t("settings.saving"));
    setSaving(true);
    try {
      const result = await api.settings.update({ nativeLanguage: next, activeStudyLanguage: useStudyLanguageStore.getState().selectedName });
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
        report(replacement ? t("settings.savedStudyLanguageChanged", { language: label(replacement.name) }) : t("settings.savedNoStudyLanguage"));
      } else {
        report(t("settings.saved"));
      }
      await refreshStudyData(queryClient);
    } catch (error) {
      setNativeLanguage(user.nativeLanguage);
      report(errorMessage(error), true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-6" data-settings-panel="system" hidden={hidden}>
      <div id="settingsForm" className="grid gap-6">
        <SettingSection title={t("settings.sectionLanguage")}>
          <SettingRow label={t("settings.nativeLanguage")} description={t("settings.nativeLanguageHint")} htmlFor="nativeLanguageSelect" stacked>
            <select
              id="nativeLanguageSelect"
              className="min-h-11 w-full rounded-md border border-line bg-panel px-3 text-base text-main outline-none focus:border-brand focus:ring-2 focus:ring-focus disabled:opacity-60"
              value={nativeLanguage}
              disabled={saving}
              onChange={(event) => void saveNativeLanguage(event.target.value)}
            >
              {nativeLanguageOptions.map((language) => (
                <option key={language} value={language}>
                  {t(`settings.nativeLanguage.${language}`)}
                </option>
              ))}
            </select>
          </SettingRow>
        </SettingSection>
        <SettingSection title={t("settings.sectionAppearance")}>
          <SettingRow label={t("settings.theme")} description={t("settings.themeHint")} stacked>
            <Segmented
              aria-label={t("settings.theme")}
              value={themePreference}
              onValueChange={setTheme}
              options={THEME_PREFERENCES.map((theme) => ({
                value: theme,
                label: t(THEME_LABEL_KEYS[theme]),
                itemProps: { "data-theme-option": theme }
              }))}
            />
          </SettingRow>
          <SettingRow className="desktop:hidden" label={t("collections.displayMode")} description={t("settings.displayModeHint")} stacked>
            <Segmented
              aria-label={t("collections.displayMode")}
              value={wordDisplayMode}
              onValueChange={setWordDisplayMode}
              options={(["page", "infinite"] as const).map((mode) => ({
                value: mode,
                label: t(DISPLAY_MODE_LABEL_KEYS[mode]),
                itemProps: { "data-display-mode": mode }
              }))}
            />
          </SettingRow>
        </SettingSection>
        <p id="settingsStatus" className="visually-hidden" role="status">
          {status}
        </p>
      </div>
    </div>
  );
}

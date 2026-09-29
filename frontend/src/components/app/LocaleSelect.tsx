import { useT } from "@/lib/i18n";
import { isLocale, LOCALES, useLocaleStore } from "@/stores/locale";

const LOCALE_LABEL_KEYS = { en: "ui.english", zh: "ui.chinese", ja: "ui.japanese" } as const;

/**
 * The menu bar's UI-language select, bound to the locale store. Kept a native
 * <select id="localeSelect"> (as in the legacy app) because the e2e specs
 * drive it with selectOption().
 */
export function LocaleSelect() {
  const t = useT();
  const locale = useLocaleStore((state) => state.locale);
  const setLocale = useLocaleStore((state) => state.setLocale);
  return (
    <label className="locale-select-wrap grid min-w-[140px]">
      <span className="visually-hidden">{t("ui.language")}</span>
      <select
        id="localeSelect"
        className="min-h-[52px] rounded-md border border-line bg-panel px-3 text-sm font-bold text-main outline-none hover:bg-hover focus:border-brand focus:ring-2 focus:ring-focus"
        aria-label={t("ui.language")}
        value={locale}
        onChange={(event) => isLocale(event.target.value) && setLocale(event.target.value)}
      >
        {LOCALES.map((value) => (
          <option key={value} value={value}>
            {t(LOCALE_LABEL_KEYS[value])}
          </option>
        ))}
      </select>
    </label>
  );
}

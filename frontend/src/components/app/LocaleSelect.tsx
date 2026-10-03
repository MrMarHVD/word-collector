import { NativeSelect } from "@/components/ui/native-select";
import { useT } from "@/lib/i18n";
import { isLocale, LOCALES, useLocaleStore } from "@/stores/locale";

const LOCALE_LABEL_KEYS = { en: "ui.english", zh: "ui.chinese", ja: "ui.japanese" } as const;

/**
 * The menu bar's UI-language select, bound to the locale store. Kept a native
 * select (`NativeSelect`, id `localeSelect`) because the e2e specs drive it
 * with selectOption().
 */
export function LocaleSelect() {
  const t = useT();
  const locale = useLocaleStore((state) => state.locale);
  const setLocale = useLocaleStore((state) => state.setLocale);
  return (
    <NativeSelect
      id="localeSelect"
      wrapperClassName="min-w-35 mobile:min-w-30"
      aria-label={t("ui.language")}
      value={locale}
      onChange={(event) => isLocale(event.target.value) && setLocale(event.target.value)}
    >
      {LOCALES.map((value) => (
        <option key={value} value={value}>
          {t(LOCALE_LABEL_KEYS[value])}
        </option>
      ))}
    </NativeSelect>
  );
}

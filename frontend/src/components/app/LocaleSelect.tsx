import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useT } from "@/lib/i18n";
import { isLocale, LOCALES, useLocaleStore } from "@/stores/locale";

const LOCALE_LABEL_KEYS = { en: "ui.english", zh: "ui.chinese", ja: "ui.japanese" } as const;

/** The menu bar's UI-language select (#localeSelect), bound to the locale store. */
export function LocaleSelect() {
  const t = useT();
  const locale = useLocaleStore((state) => state.locale);
  const setLocale = useLocaleStore((state) => state.setLocale);
  return (
    <div className="locale-select-wrap grid min-w-[140px]">
      <Select value={locale} onValueChange={(value) => isLocale(value) && setLocale(value)}>
        <SelectTrigger
          id="localeSelect"
          aria-label={t("ui.language")}
          className="min-h-[52px] w-full rounded-md border-line bg-panel px-3 text-sm font-bold text-main hover:bg-hover data-[size=default]:h-auto"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {LOCALES.map((value) => (
            <SelectItem key={value} value={value}>
              {t(LOCALE_LABEL_KEYS[value])}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/**
 * i18n over the shared locales.json catalogue (the same file the legacy app
 * serves as /locales.json). Semantics match public/js/i18n.js: `{name}`
 * placeholders are interpolated, and a missing or empty key falls back to
 * Japanese, then the caller's fallback, then the key itself.
 */

import { useCallback } from "react";
import catalogue from "../../public/locales.json";
import { useLocaleStore, type Locale } from "@/stores/locale";

export type Messages = Record<string, Record<string, string>>;
export type TranslationValues = Record<string, string | number>;
export type TranslateFn = (key: string, values?: TranslationValues, fallback?: string) => string;

/** The bundled message catalogue, keyed by locale then message key. */
export const messages: Messages = catalogue;

/** Pure translation over an explicit catalogue and locale. */
export function translate(catalog: Messages, locale: string, key: string, values: TranslationValues = {}, fallback?: string): string {
  const message = catalog[locale]?.[key] || catalog.ja?.[key] || fallback || key;
  return Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), message);
}

/** Translates with the current locale outside React (event handlers, stores, the API client). */
export const t: TranslateFn = (key, values, fallback) => translate(messages, useLocaleStore.getState().locale, key, values, fallback);

/** Formats a count with the given locale's number rules. */
export function formatCount(value: number, locale: Locale = useLocaleStore.getState().locale): string {
  return new Intl.NumberFormat(locale).format(value);
}

/** Returns a `t(key, values?, fallback?)` bound to the active locale; components re-render on locale change. */
export function useT(): TranslateFn {
  const locale = useLocaleStore((state) => state.locale);
  return useCallback<TranslateFn>((key, values, fallback) => translate(messages, locale, key, values, fallback), [locale]);
}

/** Returns a count formatter bound to the active locale. */
export function useFormatCount(): (value: number) => string {
  const locale = useLocaleStore((state) => state.locale);
  return useCallback((value: number) => formatCount(value, locale), [locale]);
}

/**
 * Pure settings rules, ported from public/js/features/settings/settings.controller.js:
 * the account-details rows and the account-deletion email check.
 */

import type { User } from "@/lib/api/types";

/** One row of #accountDetails: a label key and its already localised value. */
export interface AccountDetailRow {
  labelKey: string;
  value: string;
}

type Translate = (key: string) => string;

/** Whether the typed confirmation matches the account email (trimmed, case-insensitive). */
export function deleteConfirmationMatches(email: string | null | undefined, confirmation: string): boolean {
  const expected = String(email || "").toLowerCase();
  return Boolean(expected) && confirmation.trim().toLowerCase() === expected;
}

/** Medium-style account date in the UI locale, or null when the value is missing or invalid. */
export function formatAccountDate(value: string | null | undefined, locale: string): string | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date);
}

/** The rows of #accountDetails, in the legacy order and with the legacy fallbacks. */
export function accountDetailRows(user: Partial<User> | null, t: Translate, locale: string): AccountDetailRow[] {
  const account = user || {};
  const unknown = t("settings.accountUnknown");
  const signInMethods = [account.hasGoogle ? t("settings.accountGoogle") : "", account.hasPassword ? t("settings.accountPassword") : ""]
    .filter(Boolean)
    .join(", ");
  return [
    { labelKey: "settings.accountEmail", value: account.email || unknown },
    { labelKey: "settings.accountName", value: account.displayName || t("settings.accountNotProvided") },
    { labelKey: "settings.accountCreatedAt", value: formatAccountDate(account.createdAt, locale) || unknown },
    { labelKey: "settings.accountSignInMethods", value: signInMethods || unknown },
    { labelKey: "settings.accountEmailVerified", value: t(account.emailVerified === true ? "settings.accountVerified" : "settings.accountNotVerified") }
  ];
}

/**
 * Toast helpers over sonner (replaces window.alert and transient notices).
 * The <Toaster /> is mounted once in the app providers; pass localised text.
 */

import { toast as sonner } from "sonner";
import { t } from "@/lib/i18n";

export const toast = {
  /** Neutral notice. */
  info: (message: string) => sonner(message),
  success: (message: string) => sonner.success(message),
  error: (message: string) => sonner.error(message)
};

/** Shows an error toast for a caught error: its (already localised) message, else t("errors.requestFailed"). */
export function toastError(error: unknown): void {
  sonner.error(error instanceof Error && error.message ? error.message : t("errors.requestFailed"));
}

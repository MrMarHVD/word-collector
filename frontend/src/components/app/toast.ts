/**
 * Toast helpers over sonner (replaces window.alert and transient notices).
 * The <Toaster /> is mounted once in the app providers; pass localised text.
 */

import { toast as sonner } from "sonner";
import { errorMessage } from "@/lib/api/client";

export const toast = {
  /** Neutral notice. */
  info: (message: string) => sonner(message),
  success: (message: string) => sonner.success(message),
  error: (message: string) => sonner.error(message)
};

/** Shows an error toast for a caught error (text from errorMessage in @/lib/api). */
export function toastError(error: unknown): void {
  sonner.error(errorMessage(error));
}

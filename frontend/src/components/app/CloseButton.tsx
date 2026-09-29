import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export interface CloseButtonProps extends Omit<ComponentProps<"button">, "children" | "type"> {
  /** Localised accessible label (e.g. t("common.close")). */
  label: string;
}

/**
 * Circular close button with a centred SVG × (the legacy `.close-button`).
 * Extra props (onClick, data-* test hooks, className) pass through to the button.
 */
export function CloseButton({ label, className, ...props }: CloseButtonProps) {
  return (
    <button type="button" className={cn("close-button", className)} aria-label={label} {...props}>
      <svg aria-hidden="true" viewBox="0 0 24 24" className="close-button-icon">
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    </button>
  );
}

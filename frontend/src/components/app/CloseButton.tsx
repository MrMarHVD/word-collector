import type { ComponentProps } from "react";
import { XIcon } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";

export interface CloseButtonProps extends Omit<ComponentProps<typeof IconButton>, "children" | "type" | "aria-label" | "variant"> {
  /** Localised accessible label (e.g. t("common.close")). */
  label: string;
}

/**
 * Canonical close button: an `IconButton` with a × icon. Extra props (onClick, data-* test hooks,
 * className) pass through to the button.
 */
export function CloseButton({ label, ...props }: CloseButtonProps) {
  return (
    <IconButton data-slot="close-button" size="sm" aria-label={label} {...props}>
      <XIcon />
    </IconButton>
  );
}

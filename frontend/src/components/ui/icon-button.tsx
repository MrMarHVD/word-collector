/**
 * Canonical icon-only button (SPEC-005 D2): a square `Button` that requires an accessible name.
 */
import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface IconButtonProps extends Omit<React.ComponentProps<typeof Button>, "variant" | "size" | "aria-label" | "children"> {
  /** Required accessible name (localised). */
  "aria-label": string;
  /** `sm` 32px, `md` 36px (44px on mobile). */
  size?: "sm" | "md";
  /** `ghost` (default), `secondary` (hairline) or `destructive` (danger-coloured ghost). */
  variant?: "ghost" | "secondary" | "destructive";
  /** The icon, usually a lucide icon. */
  children: React.ReactNode;
}

/** Icon button: `<IconButton aria-label={t("common.close")}><XIcon /></IconButton>`. */
function IconButton({ className, variant = "ghost", size = "md", ...props }: IconButtonProps) {
  return (
    <Button
      data-slot="icon-button"
      type="button"
      variant={variant === "destructive" ? "ghost" : variant}
      size={size === "sm" ? "icon-sm" : "icon"}
      className={cn(size === "md" && "mobile:size-11", variant === "destructive" && "text-destructive hover:bg-destructive/10", className)}
      {...props}
    />
  );
}

export { IconButton };

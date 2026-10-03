import * as React from "react";
import { cn } from "@/lib/utils";

/** Shared text-field surface (SPEC-005 D2): Input, Textarea, SelectTrigger and NativeSelect all use it. */
export const FIELD_CLASS =
  "focus-ring w-full min-w-0 rounded-control border border-line-strong bg-subtle px-3 text-body text-main transition-colors outline-none placeholder:text-secondary disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive";

/**
 * Canonical single-line text field: 36px high (44px on mobile). `variant="search"` is the search-bar
 * look: the panel surface (`bg-panel`) instead of the field fill, same muted border. Use it for every search input.
 */
function Input({ className, type, variant = "field", ...props }: React.ComponentProps<"input"> & { variant?: "field" | "search" }) {
  return (
    <input
      type={type}
      data-slot="input"
      data-variant={variant}
      className={cn(
        FIELD_CLASS,
        variant === "search" && "bg-panel",
        "h-9 py-1 mobile:h-11 file:mr-3 file:inline-flex file:h-7 file:items-center file:border-0 file:bg-transparent file:text-body file:font-medium file:text-main",
        className
      )}
      {...props}
    />
  );
}

export { Input };

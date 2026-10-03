/**
 * Canonical native `<select>` (SPEC-005 D2), styled like `Input`. Only for the places that must stay
 * native because Playwright drives them with `selectOption` (e.g. `#localeSelect`); use the kit `Select` elsewhere.
 */
import * as React from "react";
import { ChevronDownIcon } from "lucide-react";
import { FIELD_CLASS } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface NativeSelectProps extends React.ComponentProps<"select"> {
  /** Classes for the wrapper that holds the select and its chevron. */
  wrapperClassName?: string;
}

/** `className`, `id` and every other prop go to the `<select>` itself. */
function NativeSelect({ className, wrapperClassName, children, ...props }: NativeSelectProps) {
  return (
    <div data-slot="native-select-wrapper" className={cn("relative w-full", wrapperClassName)}>
      <select data-slot="native-select" className={cn(FIELD_CLASS, "h-9 appearance-none py-1 pr-9 mobile:h-11", className)} {...props}>
        {children}
      </select>
      <ChevronDownIcon aria-hidden="true" className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-secondary" />
    </div>
  );
}

export { NativeSelect };

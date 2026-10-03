/**
 * Canonical segmented control (SPEC-005 D2): single-select value picking on the kit ToggleGroup
 * (theme, word display mode).
 */
import type { ComponentProps, ReactNode } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  /** Extra props for the item, e.g. `{ "data-theme-option": "dark" }`. */
  itemProps?: Omit<ComponentProps<typeof ToggleGroupItem>, "value" | "children"> & Record<`data-${string}`, string>;
}

export interface SegmentedProps<T extends string> {
  value: T;
  onValueChange: (value: T) => void;
  options: SegmentedOption<T>[];
  /** Accessible name of the group. */
  "aria-label": string;
  /** `md` (default): 36px, 44px on mobile. `sm`: 32px. */
  size?: "sm" | "md";
  className?: string;
}

/**
 * Always has one selected item (re-clicking it is a no-op). Radix marks the selected item with
 * `aria-checked`; items share the width equally so the group fits one row on mobile.
 */
export function Segmented<T extends string>({ value, onValueChange, options, size = "md", className, ...props }: SegmentedProps<T>) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(next) => next && onValueChange(next as T)}
      spacing={1}
      className={cn("w-full rounded-control bg-subtle p-0.5", className)}
      {...props}
    >
      {options.map(({ value: optionValue, label, itemProps: { className: itemClassName, ...itemProps } = {} }) => (
        <ToggleGroupItem
          key={optionValue}
          value={optionValue}
          className={cn(
            "flex-1 rounded-control px-3 text-body font-medium text-secondary hover:bg-accent hover:text-main data-[state=on]:bg-panel data-[state=on]:font-semibold data-[state=on]:inset-ring-1 data-[state=on]:inset-ring-line data-[state=on]:text-main",
            size === "sm" ? "h-8" : "h-9 mobile:h-11",
            itemClassName
          )}
          {...itemProps}
        >
          {label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

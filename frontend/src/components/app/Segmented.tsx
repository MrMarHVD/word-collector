/**
 * Single-select segmented control on the kit ToggleGroup (theme, word display mode).
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
  className?: string;
}

/**
 * Always has one selected item (re-clicking it is a no-op). Radix marks the selected item with
 * `aria-checked`; items share the width equally so the group fits one row on mobile.
 */
export function Segmented<T extends string>({ value, onValueChange, options, className, ...props }: SegmentedProps<T>) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(next) => next && onValueChange(next as T)}
      spacing={1}
      className={cn("w-full rounded-lg border border-line bg-subtle p-1", className)}
      {...props}
    >
      {options.map(({ value: optionValue, label, itemProps }) => (
        <ToggleGroupItem
          key={optionValue}
          value={optionValue}
          className="min-h-11 flex-1 rounded-md px-3 text-sm font-bold text-secondary hover:bg-panel hover:text-main data-[state=on]:bg-panel data-[state=on]:text-main data-[state=on]:shadow-sm"
          {...itemProps}
        >
          {label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

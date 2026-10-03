import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { Progress as ProgressPrimitive } from "radix-ui";

const progressVariants = cva("relative w-full overflow-hidden rounded-control bg-muted", {
  variants: {
    size: {
      sm: "h-1.5",
      md: "h-2"
    }
  },
  defaultVariants: { size: "md" }
});

export type ProgressProps = Omit<React.ComponentProps<typeof ProgressPrimitive.Root>, "value" | "max"> &
  VariantProps<typeof progressVariants> & {
    /** Percent complete, 0 to 100. Ignored (and `aria-valuenow` omitted) while `indeterminate`. */
    value?: number;
    /** Unknown progress: a full, pulsing indicator without `aria-valuenow`. */
    indeterminate?: boolean;
    /** Accessible name; pass `aria-label` or `aria-labelledby`. */
    "aria-label"?: string;
    /** Props for the indicator element (e.g. `id`). */
    indicatorProps?: React.ComponentProps<"div">;
  };

/** Token-styled progress bar (track plus indicator) with `role="progressbar"`: `<Progress value={40} aria-label="Reading progress" />`. */
function Progress({ className, size, value = 0, indeterminate = false, indicatorProps, ...props }: ProgressProps) {
  const percent = indeterminate ? 100 : Math.min(100, Math.max(0, value));
  const { className: indicatorClassName, style: indicatorStyle, ...indicatorRest } = indicatorProps ?? {};
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      value={indeterminate ? null : percent}
      max={100}
      className={cn(progressVariants({ size }), className)}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className={cn(
          "h-full rounded-control bg-primary transition-[width] duration-500 motion-reduce:transition-none",
          indeterminate && "animate-pulse",
          indicatorClassName
        )}
        style={{ ...indicatorStyle, width: `${percent}%` }}
        {...indicatorRest}
      />
    </ProgressPrimitive.Root>
  );
}

export { Progress, progressVariants };

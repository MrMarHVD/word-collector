import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { Slot } from "radix-ui";

/**
 * Canonical badge (SPEC-005 D2), the only pill-shaped element. Variants: neutral, accent, destructive,
 * outline, and the word-status variants unknown, learning, known. `default` and `secondary` are
 * backward-compatible aliases of `neutral`.
 */
const badgeVariants = cva(
  "focus-ring inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-pill border border-transparent px-2 py-0.5 text-caption font-medium whitespace-nowrap transition-colors [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        neutral: "bg-muted text-main [a&]:hover:bg-accent",
        default: "bg-muted text-main [a&]:hover:bg-accent",
        secondary: "bg-muted text-main [a&]:hover:bg-accent",
        accent: "bg-accent-subtle text-main",
        destructive: "bg-destructive/10 text-destructive",
        outline: "border-line text-main [a&]:hover:bg-accent",
        unknown: "bg-status-unknown/20 text-status-unknown-text",
        learning: "bg-status-learning/15 text-status-learning-text",
        known: "bg-status-known/15 text-status-known-text"
      }
    },
    defaultVariants: {
      variant: "neutral"
    }
  }
);

function Badge({
  className,
  variant = "neutral",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span";

  return <Comp data-slot="badge" data-variant={variant} className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };

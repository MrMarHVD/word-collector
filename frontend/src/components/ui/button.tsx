import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { Slot } from "radix-ui";

/**
 * Canonical button (SPEC-005 D2). Variants: primary, secondary, ghost, destructive (plus `link`).
 * Sizes: sm, md, lg and the square icon sizes. `default` (variant and size) and `outline` are
 * backward-compatible aliases of `primary`, `md` and `secondary`; new code uses the canonical names.
 */
const buttonVariants = cva(
  "focus-ring inline-flex shrink-0 items-center justify-center gap-2 rounded-control text-sm font-medium whitespace-nowrap transition-colors outline-none disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:bg-brand-strong",
        default: "bg-primary text-primary-foreground hover:bg-brand-strong",
        secondary: "border border-line-strong bg-panel text-main hover:bg-accent",
        outline: "border border-line-strong bg-panel text-main hover:bg-accent",
        ghost: "text-main hover:bg-accent",
        destructive: "bg-danger-fill text-white hover:bg-danger-fill/90 disabled:bg-danger-fill/10 disabled:text-destructive",
        link: "text-primary underline-offset-4 hover:underline"
      },
      size: {
        sm: "h-8 gap-1.5 px-3 has-[>svg]:px-2.5",
        md: "h-9 px-4 py-2 has-[>svg]:px-3",
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        lg: "h-11 px-6 has-[>svg]:px-4",
        xs: "h-6 gap-1 px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        icon: "size-9",
        "icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-11"
      }
    },
    defaultVariants: {
      variant: "primary",
      size: "md"
    }
  }
);

function Button({
  className,
  variant = "primary",
  size = "md",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "button";

  return <Comp data-slot="button" data-variant={variant} data-size={size} className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { Button, buttonVariants };

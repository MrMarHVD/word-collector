/**
 * Canonical text styles (SPEC-005 D2): title, heading, body and caption on the D1 type scale.
 */
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const textVariants = cva("", {
  variants: {
    variant: {
      title: "text-title",
      heading: "text-heading",
      body: "text-body",
      caption: "text-caption"
    },
    /** `main` is primary text, `label` secondary text that stays AA on glass, `muted` quiet text (not on glass). */
    tone: {
      main: "text-main",
      label: "text-label",
      muted: "text-secondary"
    }
  },
  defaultVariants: {
    variant: "body",
    tone: "main"
  }
});

const DEFAULT_TAGS = { title: "h1", heading: "h2", body: "p", caption: "span" } as const;

export type TextProps = Omit<React.HTMLAttributes<HTMLElement>, "color"> &
  VariantProps<typeof textVariants> & {
    /** Element to render; defaults to h1 (title), h2 (heading), p (body) or span (caption). */
    as?: React.ElementType;
  };

/** Renders text in one of the four canonical styles: `<Text variant="heading" as="h3">`. */
function Text({ variant = "body", tone = "main", as, className, ...props }: TextProps) {
  const Comp = as ?? DEFAULT_TAGS[variant ?? "body"];
  return <Comp data-slot="text" data-variant={variant} className={cn(textVariants({ variant, tone }), className)} {...props} />;
}

export { Text, textVariants };

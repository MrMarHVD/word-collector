/**
 * Canonical page header (SPEC-005 D2): the screen title (`Text` title style) with optional actions
 * on the right, so every main screen starts with the same title style and spacing.
 */
import type { ComponentProps, ReactNode } from "react";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

export interface PageHeaderProps extends Omit<ComponentProps<"header">, "title"> {
  /** Localised screen title, rendered as the page's `h1`. */
  title: ReactNode;
  /** Controls aligned right of the title (e.g. a `Segmented`); wrap them in `mobile:hidden` if they do not fit. */
  actions?: ReactNode;
}

/** Title row for a main screen: `min-h-9` so screens with and without actions share one height, `mb-4` below. */
export function PageHeader({ title, actions, className, ...props }: PageHeaderProps) {
  return (
    <header className={cn("mb-4 flex min-h-9 items-center justify-between gap-3", className)} {...props}>
      <Text variant="title" as="h1" className="min-w-0 truncate">
        {title}
      </Text>
      {actions}
    </header>
  );
}

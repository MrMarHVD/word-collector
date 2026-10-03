/**
 * Canonical list row (SPEC-005 D2): a hairline-divided row with a tonal hover and slots for
 * leading, title, meta, trailing and actions.
 */
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface ListRowProps extends Omit<ComponentProps<"div">, "title"> {
  /** Icon, flag or checkbox before the text. */
  leading?: ReactNode;
  /** Primary text (body style, truncates). */
  title: ReactNode;
  /** Secondary line under the title (caption style, truncates). */
  meta?: ReactNode;
  /** Value or badge aligned right, before the actions. */
  trailing?: ReactNode;
  /** Icon buttons or a menu at the far right. */
  actions?: ReactNode;
  /** Active/selected row (accent-subtle fill). */
  selected?: boolean;
}

/**
 * One row. Place rows in a list or card; the last row has no divider. Extra props (onClick, data-*,
 * role, className) go to the root element.
 */
export function ListRow({ leading, title, meta, trailing, actions, selected = false, className, ...props }: ListRowProps) {
  return (
    <div
      data-slot="list-row"
      data-selected={selected || undefined}
      className={cn(
        "flex min-h-11 items-center gap-3 border-b border-line px-4 py-2 transition-colors last:border-b-0 hover:bg-subtle data-[selected]:bg-accent",
        className
      )}
      {...props}
    >
      {leading ? <div className="flex shrink-0 items-center">{leading}</div> : null}
      <div className="grid min-w-0 flex-1 gap-0.5">
        <div className="truncate text-body text-main">{title}</div>
        {meta ? <div className="truncate text-caption text-secondary">{meta}</div> : null}
      </div>
      {trailing ? <div className="flex shrink-0 items-center gap-2 text-caption text-label">{trailing}</div> : null}
      {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
    </div>
  );
}

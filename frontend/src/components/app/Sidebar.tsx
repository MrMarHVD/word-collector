import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface SidebarLayoutProps extends ComponentProps<"section"> {
  collapsed: boolean;
}

/** Wrapper around a Sidebar and its content; `is-sidebar-collapsed` slides the sidebar out. Pane-specific grid classes go in className. */
export function SidebarLayout({ collapsed, className, ...props }: SidebarLayoutProps) {
  return <section className={cn("app-sidebar-layout", collapsed && "is-sidebar-collapsed", className)} {...props} />;
}

export interface SidebarProps extends Omit<ComponentProps<"aside">, "children"> {
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  /** Localised, visually hidden label of the minimise button (e.g. t("collections.toggleSidebar")). */
  toggleLabel: string;
  /** Id of the minimise button (e.g. "collectionsSidebarToggle"). */
  toggleId?: string;
  /** Extra classes on the head row. */
  headClassName?: string;
  children: ReactNode;
}

/**
 * Collapsible sidebar shared by the reader and vocab panes (the legacy
 * `.app-sidebar` with its minimise button). Controlled: persist `collapsed`
 * yourself (reader preferences store, or usePersistentState).
 */
export function Sidebar({ collapsed, onCollapsedChange, toggleLabel, toggleId, headClassName, className, children, ...props }: SidebarProps) {
  return (
    <aside className={cn("app-sidebar", className)} {...props}>
      <div className={cn("app-sidebar-head", headClassName)}>
        <button
          id={toggleId}
          className="secondary-button icon-button grid h-[42px] w-[42px] place-items-center rounded-md border border-line bg-panel text-brand hover:bg-hover"
          type="button"
          aria-expanded={!collapsed}
          onClick={() => onCollapsedChange(!collapsed)}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current stroke-[1.8]">
            <path d="M15 6l-6 6 6 6" />
          </svg>
          <span className="visually-hidden">{toggleLabel}</span>
        </button>
      </div>
      {children}
    </aside>
  );
}

export interface SidebarOpenButtonProps extends Omit<ComponentProps<"button">, "children" | "type" | "hidden"> {
  /** Shown only while the sidebar is collapsed. */
  collapsed: boolean;
  onOpen: () => void;
  /** Localised, visually hidden label (e.g. t("collections.openSidebar")). */
  label: string;
}

/** Floating button at the left edge that re-opens a collapsed Sidebar. Position it (top offset) via className or style. */
export function SidebarOpenButton({ collapsed, onOpen, label, className, ...props }: SidebarOpenButtonProps) {
  return (
    <button
      className={cn(
        "secondary-button fixed left-0 z-[9] grid min-h-[52px] w-[42px] place-items-center rounded-r-lg border border-l-0 border-line bg-panel text-brand shadow-panel",
        className
      )}
      type="button"
      hidden={!collapsed}
      onClick={onOpen}
      {...props}
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current stroke-[1.8]">
        <path d="M4 5h16M4 12h16M4 19h16" />
      </svg>
      <span className="visually-hidden">{label}</span>
    </button>
  );
}

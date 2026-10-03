import type { ComponentProps, ReactNode } from "react";
import { ChevronLeftIcon, MenuIcon } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
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
 * Collapsible sidebar shared by the reader and vocab panes: the canonical card surface (hairline border on
 * `bg-panel`) with a minimise button. Controlled: persist `collapsed`
 * yourself (reader preferences store, or usePersistentState).
 */
export function Sidebar({ collapsed, onCollapsedChange, toggleLabel, toggleId, headClassName, className, children, ...props }: SidebarProps) {
  return (
    <aside className={cn("app-sidebar rounded-container border border-line bg-panel p-3.5", className)} {...props}>
      <div className={cn("app-sidebar-head", headClassName)}>
        <IconButton id={toggleId} variant="secondary" aria-label={toggleLabel} aria-expanded={!collapsed} onClick={() => onCollapsedChange(!collapsed)}>
          <ChevronLeftIcon />
        </IconButton>
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
    <IconButton
      variant="secondary"
      className={cn("fixed left-0 z-[9] h-[52px] rounded-l-none border-l-0", className)}
      aria-label={label}
      hidden={!collapsed}
      onClick={onOpen}
      {...props}
    >
      <MenuIcon />
    </IconButton>
  );
}

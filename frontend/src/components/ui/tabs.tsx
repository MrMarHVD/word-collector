import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { Tabs as TabsPrimitive } from "radix-ui";

function Tabs({ className, orientation = "horizontal", ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      orientation={orientation}
      className={cn("group/tabs flex gap-2 data-[orientation=horizontal]:flex-col", className)}
      {...props}
    />
  );
}

/**
 * Canonical tabs (SPEC-005 D2): underline style for page navigation. The list has a hairline under
 * (or beside, when vertical) it and the active trigger an accent underline. `line` and `default`
 * are accepted for backward compatibility and render the same. `bar` puts the list on the panel
 * surface as a full-width hairline bar (page-level sub-menu or, vertical, a side menu); its edge replaces the underline hairline.
 */
const tabsListVariants = cva(
  "group/tabs-list inline-flex w-fit items-center text-secondary group-data-[orientation=horizontal]/tabs:gap-1 group-data-[orientation=horizontal]/tabs:border-b group-data-[orientation=horizontal]/tabs:border-line group-data-[orientation=vertical]/tabs:h-fit group-data-[orientation=vertical]/tabs:flex-col group-data-[orientation=vertical]/tabs:border-r group-data-[orientation=vertical]/tabs:border-line",
  {
    variants: {
      variant: {
        underline: "",
        bar: "w-full rounded-container border border-line bg-panel px-2 group-data-[orientation=vertical]/tabs:px-0 group-data-[orientation=vertical]/tabs:py-2",
        default: "",
        line: ""
      }
    },
    defaultVariants: {
      variant: "underline"
    }
  }
);

function TabsList({ className, variant = "underline", ...props }: React.ComponentProps<typeof TabsPrimitive.List> & VariantProps<typeof tabsListVariants>) {
  return <TabsPrimitive.List data-slot="tabs-list" data-variant={variant} className={cn(tabsListVariants({ variant }), className)} {...props} />;
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "focus-ring relative inline-flex h-9 items-center justify-center gap-1.5 rounded-control px-3 text-body font-medium whitespace-nowrap text-secondary transition-colors outline-none group-data-[orientation=vertical]/tabs:w-full group-data-[orientation=vertical]/tabs:justify-start hover:bg-hover hover:text-main disabled:pointer-events-none disabled:opacity-50 data-[state=active]:text-main mobile:h-11 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        "after:absolute after:bg-primary after:opacity-0 after:transition-opacity group-data-[orientation=horizontal]/tabs:after:inset-x-3 group-data-[orientation=horizontal]/tabs:after:-bottom-px group-data-[orientation=horizontal]/tabs:after:h-0.5 group-data-[orientation=vertical]/tabs:after:inset-y-1 group-data-[orientation=vertical]/tabs:after:-right-px group-data-[orientation=vertical]/tabs:after:w-0.5 data-[state=active]:after:opacity-100",
        className
      )}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content data-slot="tabs-content" className={cn("flex-1 focus-ring outline-none", className)} {...props} />;
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants };

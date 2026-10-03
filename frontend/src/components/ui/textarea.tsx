import * as React from "react";
import { FIELD_CLASS } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Canonical multi-line text field, on the same surface as `Input`. */
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea data-slot="textarea" className={cn(FIELD_CLASS, "flex field-sizing-content min-h-16 py-2", className)} {...props} />;
}

export { Textarea };

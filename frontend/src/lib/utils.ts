import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/** tailwind-merge that knows the design tokens' custom utilities (text styles, radius scale, float shadow). */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["title", "heading", "body", "caption"] }],
      rounded: [{ rounded: ["control", "container", "pill"] }],
      shadow: [{ shadow: ["float"] }]
    }
  }
});

/** Merges class names, resolving conflicting Tailwind utilities (shadcn helper). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

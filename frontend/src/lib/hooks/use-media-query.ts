import { useSyncExternalStore } from "react";

/** The legacy app's single layout breakpoint: at or below this width the mobile layout applies. */
export const MOBILE_LAYOUT_QUERY = "(max-width: 760px)";

/** Subscribes to a CSS media query and returns whether it currently matches. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false
  );
}

/** True at or below 760px, where the legacy app switches to its mobile layout. */
export function useIsMobileLayout(): boolean {
  return useMediaQuery(MOBILE_LAYOUT_QUERY);
}

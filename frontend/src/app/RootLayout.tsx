import { Suspense, useEffect } from "react";
import { Outlet } from "react-router";
import { AppShell } from "@/components/app/AppShell";
import { useSessionStore } from "@/stores/session";
import { AuthPage } from "./pages";

const MOBILE_ZOOM_QUERY = "(max-width: 760px), (pointer: coarse)";

/** Blocks pinch-zoom and multi-touch scroll on mobile layouts, like the legacy bindMobileZoomGuard. */
function useMobileZoomGuard(): void {
  useEffect(() => {
    const prevent = (event: Event) => {
      if (window.matchMedia(MOBILE_ZOOM_QUERY).matches) {
        event.preventDefault();
      }
    };
    const preventMultiTouch = (event: TouchEvent) => {
      if (event.touches.length > 1) {
        prevent(event);
      }
    };
    const options = { passive: false };
    document.addEventListener("gesturestart", prevent, options);
    document.addEventListener("gesturechange", prevent, options);
    document.addEventListener("gestureend", prevent, options);
    document.addEventListener("touchmove", preventMultiTouch, options);
    return () => {
      document.removeEventListener("gesturestart", prevent);
      document.removeEventListener("gesturechange", prevent);
      document.removeEventListener("gestureend", prevent);
      document.removeEventListener("touchmove", preventMultiTouch);
    };
  }, []);
}

/**
 * Top-level layout: nothing until the session bootstrap finishes (as the
 * legacy app kept every view hidden), then either the auth screen or the app
 * shell around the routed page. One Suspense boundary wraps the whole shell,
 * so #appShell only becomes visible together with its page content.
 */
export function RootLayout() {
  const status = useSessionStore((state) => state.status);
  const authScreenOpen = useSessionStore((state) => state.authScreen !== null);
  useMobileZoomGuard();

  if (status === "loading") {
    return null;
  }
  return (
    <Suspense fallback={null}>
      {authScreenOpen ? (
        <AuthPage />
      ) : (
        <AppShell>
          <Outlet />
        </AppShell>
      )}
    </Suspense>
  );
}

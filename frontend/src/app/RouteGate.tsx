import { useEffect, type ReactNode } from "react";
import { Navigate, useNavigate } from "react-router";
import { isAdminUser, useSessionStore } from "@/stores/session";
import { useStudyLanguageStore } from "@/stores/study-language";
import { WelcomePage } from "./pages";
import { LANGUAGE_REQUIRED_TABS, pathForTab, readSavedTab, saveActiveTab, type Tab } from "./route-paths";

/** Replaces the URL with "/" after mount (the page underneath already shows the welcome screen). */
function ReplaceWithRoot() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate("/", { replace: true });
  }, [navigate]);
  return null;
}

/**
 * Applies the legacy router's gating to a tab page:
 * - signed out: the welcome screen renders in place and the URL is kept, so
 *   the deep link opens after login;
 * - a language-required tab without a study language: the welcome language
 *   gate, with the URL replaced by "/";
 * - /admin for non-admins: replaced by the dashboard.
 * Otherwise the page renders and the tab is saved as wordMarkerActiveTab.
 */
export function RouteGate({ tab, children }: { tab: Tab; children: ReactNode }) {
  const user = useSessionStore((state) => state.user);
  const hasStudyLanguage = useStudyLanguageStore((state) => state.selectedId !== null);
  const needsLanguage = LANGUAGE_REQUIRED_TABS.has(tab) && !hasStudyLanguage;
  const allowed = Boolean(user) && !needsLanguage && (tab !== "admin" || isAdminUser(user));

  useEffect(() => {
    if (allowed) {
      saveActiveTab(tab);
    }
  }, [allowed, tab]);

  if (!user) {
    return <WelcomePage />;
  }
  if (needsLanguage) {
    return (
      <>
        <WelcomePage />
        <ReplaceWithRoot />
      </>
    );
  }
  if (tab === "admin" && !isAdminUser(user)) {
    return <Navigate to={pathForTab("dashboard")} replace />;
  }
  return children;
}

/**
 * "/" and unknown paths: signed-in users with a study language go to their
 * last tab (wordMarkerActiveTab, default dashboard); everyone else sees the
 * welcome screen (with the language gate when signed in).
 */
export function HomeRoute() {
  const user = useSessionStore((state) => state.user);
  const hasStudyLanguage = useStudyLanguageStore((state) => state.selectedId !== null);
  if (user && hasStudyLanguage) {
    return <Navigate to={pathForTab(readSavedTab())} replace />;
  }
  return <WelcomePage />;
}

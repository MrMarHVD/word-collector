import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router";
import { FadeIn } from "@/components/app/FadeIn";
import { LocaleSelect } from "@/components/app/LocaleSelect";
import { StudyLanguageSelect } from "@/components/app/StudyLanguageSelect";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { VerifyBanner } from "@/features/auth";
import { isReaderPath, pathForTab, tabForPath, type Tab } from "@/app/route-paths";
import { dashboardSummaryQuery } from "@/lib/api/queries";
import { useIsMobileLayout } from "@/lib/hooks/use-media-query";
import { useFormatCount, useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useReaderPreferencesStore } from "@/stores/reader-preferences";
import { isAdminUser, useSessionStore } from "@/stores/session";
import { useStudyLanguageStore } from "@/stores/study-language";

/** Tabs of the main navigation, in menu order; "admin" is appended for admins. */
const NAV_TABS: { tab: Tab; labelKey: string }[] = [
  { tab: "dashboard", labelKey: "tabs.dashboard" },
  { tab: "collections", labelKey: "tabs.collections" },
  { tab: "reader", labelKey: "nav.read" },
  { tab: "practice", labelKey: "tabs.practice" }
];

function GearIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="menu-icon-gear size-5 fill-none stroke-current stroke-[1.8]">
      <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.3a2 2 0 0 1-4 0V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1A2 2 0 0 1 4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H2.7a2 2 0 0 1 0-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7A2 2 0 0 1 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6v-.3a2 2 0 0 1 4 0V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1A2 2 0 0 1 19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.3a2 2 0 0 1 0 4H21a1.7 1.7 0 0 0-1.6 1Z" />
    </svg>
  );
}

function BurgerIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="menu-icon-burger size-5 fill-none stroke-current stroke-[2]">
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

const MENU_ICON_BUTTON = "secondary-button icon-button size-[52px] shadow-none";
const MENU_ITEM = "account-menu-item w-full rounded-md px-3 py-2 text-left text-sm font-bold text-main hover:bg-hover";

interface AccountMenuProps {
  activeTab: Tab | null;
  isAdmin: boolean;
  onNavigate: (tab: Tab) => void;
}

/** Desktop: settings (gear) and logout buttons. Mobile: a hamburger menu with the tabs, settings and logout. */
function AccountMenu({ activeTab, isAdmin, onNavigate }: AccountMenuProps) {
  const t = useT();
  const isMobile = useIsMobileLayout();
  const logout = useSessionStore((state) => state.logout);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  /** Logs out, keeping #logoutButton disabled while the request is in flight (legacy auth.controller.js). */
  async function handleLogout() {
    setIsLoggingOut(true);
    try {
      await logout();
    } finally {
      setIsLoggingOut(false);
    }
  }

  if (!isMobile) {
    return (
      <>
        <Button id="settingsButton" className={MENU_ICON_BUTTON} variant="outline" size="icon" type="button" onClick={() => onNavigate("settings")}>
          <GearIcon />
          <span className="visually-hidden">{t("tabs.settings")}</span>
        </Button>
        <button
          id="logoutButton"
          className="account-menu-item logout-button rounded-md px-3 py-2 text-left text-sm font-bold text-brand hover:bg-hover"
          type="button"
          disabled={isLoggingOut}
          onClick={() => void handleLogout()}
        >
          {t("auth.logout")}
        </button>
      </>
    );
  }

  const tabs = isAdmin ? [...NAV_TABS, { tab: "admin" as const, labelKey: "tabs.admin" }] : NAV_TABS;
  return (
    <div className="account-menu relative justify-self-end">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button id="settingsButton" className={MENU_ICON_BUTTON} variant="outline" size="icon" type="button">
            <BurgerIcon />
            <span className="visually-hidden">{t("tabs.settings")}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          id="accountDropdown"
          align="end"
          className="account-dropdown min-w-[180px] rounded-md border border-line bg-panel p-1 shadow-panel"
        >
          {tabs.map(({ tab, labelKey }) => (
            <DropdownMenuItem
              key={tab}
              id={tab === "admin" ? "adminTabMenuButton" : undefined}
              className={cn(MENU_ITEM, "account-nav-item tab-button", tab === "admin" && "admin-tab-button", activeTab === tab && "is-active")}
              data-tab={tab}
              onSelect={() => onNavigate(tab)}
            >
              {t(labelKey)}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator className="account-menu-divider my-1 bg-line" />
          <DropdownMenuItem id="accountSettingsButton" className={MENU_ITEM} onSelect={() => onNavigate("settings")}>
            {t("tabs.settings")}
          </DropdownMenuItem>
          <DropdownMenuItem
            id="logoutButton"
            className={cn(MENU_ITEM, "logout-button text-brand")}
            disabled={isLoggingOut}
            onSelect={() => void handleLogout()}
          >
            {t("auth.logout")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export interface AppShellProps {
  /** The routed page. */
  children: ReactNode;
}

/**
 * The persistent app frame (#appShell), ported from the legacy index.html and
 * views/shell.js: the fixed menu bar (brand, tab navigation, known-word
 * badge, study languages, UI language, account menu), the verification banner
 * and the routed page. Signed-out users see the guest menu bar. Also toggles
 * body.is-reader-active / is-reader-focus for the reader route.
 */
export function AppShell({ children }: AppShellProps) {
  const t = useT();
  const formatCount = useFormatCount();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const user = useSessionStore((state) => state.user);
  const selectedLanguageId = useStudyLanguageStore((state) => state.selectedId);
  const focusMode = useReaderPreferencesStore((state) => state.focusMode);
  const activeTab = tabForPath(pathname);
  const isAdmin = isAdminUser(user);
  const hasStudyLanguage = selectedLanguageId !== null;
  const { data: dashboard } = useQuery({ ...dashboardSummaryQuery(selectedLanguageId), enabled: Boolean(user && hasStudyLanguage) });

  // Every /api/dashboard response refreshes the study-language catalogue, as the legacy loadDashboard() did.
  useEffect(() => {
    if (!dashboard) {
      return;
    }
    const { languages, studyLanguageOptions, setCatalog } = useStudyLanguageStore.getState();
    setCatalog({ languages: dashboard.languages || languages, studyLanguageOptions: dashboard.studyLanguageOptions || studyLanguageOptions });
  }, [dashboard]);

  useEffect(() => {
    const onReader = Boolean(user) && isReaderPath(pathname);
    document.body.classList.toggle("is-reader-active", onReader);
    document.body.classList.toggle("is-reader-focus", onReader && focusMode);
    if (onReader) {
      window.scrollTo(0, 0);
    }
  }, [user, pathname, focusMode]);

  function goToTab(tab: Tab) {
    navigate(pathForTab(tab));
  }

  function goHome() {
    navigate(hasStudyLanguage ? pathForTab("dashboard") : "/");
  }

  return (
    <main id="appShell" className="shell mx-auto w-[min(1180px,calc(100%-32px))] pb-8 pt-24 mobile:w-[calc(100%-20px)] mobile:pt-5">
      <header
        className={cn(
          "menu-bar fixed inset-x-0 top-0 z-10 flex min-h-[72px] items-center gap-3 border-b border-line bg-page/95 px-5 py-2.5 backdrop-blur mobile:static mobile:flex-col mobile:items-stretch",
          !user && "is-guest"
        )}
      >
        <div className="menu-left flex min-w-0 flex-1 items-center gap-4 mobile:grid mobile:grid-cols-1">
          <button
            id="brandHomeButton"
            className="menu-brand whitespace-nowrap text-left text-base font-black text-brand hover:text-brand-strong"
            type="button"
            onClick={goHome}
          >
            {t("brand")}
          </button>
          <nav
            className="tabs grid w-[min(560px,100%)] grid-cols-4 gap-1 rounded-lg border border-line bg-muted p-1 mobile:w-full mobile:grid-cols-1"
            aria-label={t("shell.mainViews")}
            hidden={!user || !hasStudyLanguage}
          >
            {NAV_TABS.map(({ tab, labelKey }) => (
              <button
                key={tab}
                className={cn("tab-button rounded-md px-3 py-2 text-sm font-semibold text-secondary", activeTab === tab && "is-active")}
                type="button"
                data-tab={tab}
                aria-selected={activeTab === tab}
                onClick={() => goToTab(tab)}
              >
                {t(labelKey)}
              </button>
            ))}
            <button
              id="adminTabButton"
              className={cn("tab-button admin-tab-button rounded-md px-3 py-2 text-sm font-semibold text-secondary", activeTab === "admin" && "is-active")}
              type="button"
              data-tab="admin"
              aria-selected={activeTab === "admin"}
              hidden={!isAdmin}
              onClick={() => goToTab("admin")}
            >
              {t("tabs.admin")}
            </button>
          </nav>
        </div>
        <div className="menu-actions flex flex-none flex-nowrap items-center justify-end gap-2 mobile:grid mobile:w-full mobile:grid-cols-1">
          {user ? (
            <div className="study-language-bar relative flex items-center gap-1.5 justify-self-end mobile:justify-self-start">
              <div className="known-total-badge mr-1 flex items-center gap-1.5 whitespace-nowrap" title={t("stats.knownAll")}>
                <span id="knownTotal" className="text-lg font-black leading-none text-brand">
                  {formatCount(dashboard?.knownWords ?? 0)}
                </span>
                <small className="text-[11px] font-semibold uppercase tracking-wide text-secondary">{t("stats.knownShort")}</small>
              </div>
              <StudyLanguageSelect />
            </div>
          ) : null}
          <LocaleSelect />
          {user ? <AccountMenu activeTab={activeTab} isAdmin={isAdmin} onNavigate={goToTab} /> : null}
        </div>
      </header>
      {user ? <VerifyBanner /> : null}
      <FadeIn key={activeTab ?? pathname} rise={false}>
        {children}
      </FadeIn>
    </main>
  );
}

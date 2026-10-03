import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router";
import { FadeIn } from "@/components/app/FadeIn";
import { LocaleSelect } from "@/components/app/LocaleSelect";
import { StudyLanguageSelect } from "@/components/app/StudyLanguageSelect";
import { MenuIcon, SettingsIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Text } from "@/components/ui/text";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { VerifyBanner } from "@/features/auth";
import { isReaderPath, pathForTab, tabForPath, type Tab } from "@/app/route-paths";
import { dashboardSummaryQuery } from "@/lib/api/queries";
import { useIsMobileLayout } from "@/lib/hooks/use-media-query";
import { useFormatCount, useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { isAdminUser, useSessionStore } from "@/stores/session";
import { useStudyLanguageStore } from "@/stores/study-language";

/** Tabs of the main navigation, in menu order; "admin" is appended for admins. */
const NAV_TABS: { tab: Tab; labelKey: string }[] = [
  { tab: "dashboard", labelKey: "tabs.dashboard" },
  { tab: "collections", labelKey: "tabs.collections" },
  { tab: "reader", labelKey: "nav.read" },
  { tab: "practice", labelKey: "tabs.practice" }
];

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
        <IconButton id="settingsButton" variant="secondary" aria-label={t("tabs.settings")} onClick={() => onNavigate("settings")}>
          <SettingsIcon />
        </IconButton>
        <Button id="logoutButton" variant="ghost" disabled={isLoggingOut} onClick={() => void handleLogout()}>
          {t("auth.logout")}
        </Button>
      </>
    );
  }

  const tabs = isAdmin ? [...NAV_TABS, { tab: "admin" as const, labelKey: "tabs.admin" }] : NAV_TABS;
  return (
    <div className="relative justify-self-end">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconButton id="settingsButton" variant="secondary" aria-label={t("tabs.settings")}>
            <MenuIcon />
          </IconButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent id="accountDropdown" align="end" className="w-[min(220px,calc(100vw-20px))] min-w-[180px]">
          {tabs.map(({ tab, labelKey }) => (
            <DropdownMenuItem
              key={tab}
              id={tab === "admin" ? "adminTabMenuButton" : undefined}
              className={cn("mobile:min-h-11", activeTab === tab && "bg-accent font-semibold")}
              data-tab={tab}
              aria-current={activeTab === tab ? "page" : undefined}
              onSelect={() => onNavigate(tab)}
            >
              {t(labelKey)}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem id="accountSettingsButton" className="mobile:min-h-11" onSelect={() => onNavigate("settings")}>
            {t("tabs.settings")}
          </DropdownMenuItem>
          <DropdownMenuItem id="logoutButton" className="mobile:min-h-11" disabled={isLoggingOut} onSelect={() => void handleLogout()}>
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
    document.body.classList.toggle("is-reader-focus", onReader);
    if (onReader) {
      window.scrollTo(0, 0);
    }
  }, [user, pathname]);

  function goToTab(tab: Tab) {
    navigate(pathForTab(tab));
  }

  function goHome() {
    navigate(hasStudyLanguage ? pathForTab("dashboard") : "/");
  }

  return (
    <main
      id="appShell"
      className="mx-auto w-[min(1180px,calc(100%-32px))] pb-8 pt-24 mobile:w-full mobile:px-2.5 mobile:pb-[calc(12px+env(safe-area-inset-bottom))] mobile:pt-3"
    >
      <header className="glass fixed inset-x-0 top-0 z-10 flex min-h-[72px] items-center gap-3 px-5 py-2.5 mobile:sticky mobile:inset-x-auto mobile:-mx-2.5 mobile:-mt-3 mobile:mb-3 mobile:flex-col mobile:items-stretch mobile:px-2.5 mobile:pb-2.5 mobile:pt-[calc(8px+env(safe-area-inset-top))]">
        <div className="flex min-w-0 flex-1 items-center gap-4 mobile:grid mobile:w-full mobile:flex-none mobile:grid-cols-1">
          <Button id="brandHomeButton" variant="ghost" className="mobile:w-full" onClick={goHome}>
            <Text as="span" variant="heading">
              {t("brand")}
            </Text>
          </Button>
          <Tabs
            value={activeTab ?? ""}
            onValueChange={(value) => goToTab(value as Tab)}
            className="w-[min(560px,100%)] min-w-0 mobile:hidden"
            hidden={!user || !hasStudyLanguage}
          >
            <TabsList asChild>
              <nav className="tabs w-full group-data-[orientation=horizontal]/tabs:border-b-0" aria-label={t("shell.mainViews")}>
                {NAV_TABS.map(({ tab, labelKey }) => (
                  <TabsTrigger key={tab} value={tab} className={cn("min-w-0 flex-1", activeTab === tab && "is-active")} data-tab={tab}>
                    {t(labelKey)}
                  </TabsTrigger>
                ))}
                <TabsTrigger
                  id="adminTabButton"
                  value="admin"
                  className={cn("min-w-0 flex-1", activeTab === "admin" && "is-active")}
                  data-tab="admin"
                  hidden={!isAdmin}
                >
                  {t("tabs.admin")}
                </TabsTrigger>
              </nav>
            </TabsList>
          </Tabs>
        </div>
        <div
          className={cn(
            "flex flex-none flex-nowrap items-center justify-end gap-2 mobile:grid mobile:w-full mobile:grid-cols-[minmax(0,1fr)_minmax(7.5rem,auto)_auto]",
            !user && "desktop:absolute desktop:left-1/2 desktop:-translate-x-1/2 mobile:grid-cols-1 mobile:justify-items-center"
          )}
        >
          {user ? (
            <div className="relative flex items-center gap-1.5 justify-self-end mobile:grid mobile:min-w-0 mobile:grid-cols-[auto_minmax(0,1fr)_auto] mobile:justify-self-stretch">
              <div className="mr-1 flex items-center gap-1.5 whitespace-nowrap" title={t("stats.knownAll")}>
                <Text as="span" id="knownTotal" variant="heading" className="leading-none">
                  {formatCount(dashboard?.knownWords ?? 0)}
                </Text>
                <Text as="small" variant="caption" tone="label" className="mobile:hidden">
                  {t("stats.knownShort")}
                </Text>
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

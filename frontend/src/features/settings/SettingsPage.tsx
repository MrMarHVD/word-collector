import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useIsMobileLayout } from "@/lib/hooks/use-media-query";
import { useT } from "@/lib/i18n";
import { AccountSettingsPanel } from "./AccountSettingsPanel";
import { useSettingsTabStore, type SettingsTab } from "./settings-tab-store";
import { SystemSettingsPanel } from "./SystemSettingsPanel";
import "./settings.css";

const SETTINGS_TABS: { tab: SettingsTab; labelKey: string }[] = [
  { tab: "system", labelKey: "settings.menuSystem" },
  { tab: "account", labelKey: "settings.menuAccount" }
];

/** The settings route (#settingsView): one page heading over kit Tabs (vertical on desktop, horizontal on mobile) whose tabpanels hold the "System" and "Account" panels. */
export default function SettingsPage() {
  const t = useT();
  const isMobile = useIsMobileLayout();
  const activeTab = useSettingsTabStore((state) => state.tab);
  const setActiveTab = useSettingsTabStore((state) => state.setTab);
  return (
    <section id="settingsView" className="tab-view grid gap-4">
      <h2 className="text-lg font-bold">{t("settings.title")}</h2>
      <Tabs
        value={activeTab}
        onValueChange={(tab) => setActiveTab(tab as SettingsTab)}
        orientation={isMobile ? "horizontal" : "vertical"}
        className="settings-layout gap-4 desktop:flex-row desktop:items-start mobile:flex-col"
      >
        <TabsList id="settingsMenu" aria-label={t("settings.title")} className="shrink-0 desktop:w-44 mobile:w-full">
          {SETTINGS_TABS.map(({ tab, labelKey }) => (
            <TabsTrigger key={tab} value={tab} data-settings-tab={tab} className="min-h-9 px-3">
              {t(labelKey)}
            </TabsTrigger>
          ))}
        </TabsList>
        <div className="min-w-0 w-full max-w-xl">
          <TabsContent value="system" forceMount hidden={activeTab !== "system"} data-settings-panel="system">
            <SystemSettingsPanel />
          </TabsContent>
          <TabsContent value="account" forceMount hidden={activeTab !== "account"} data-settings-panel="account">
            <AccountSettingsPanel />
          </TabsContent>
        </div>
      </Tabs>
    </section>
  );
}

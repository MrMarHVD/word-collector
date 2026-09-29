import { useState } from "react";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { AccountSettingsPanel } from "./AccountSettingsPanel";
import { SystemSettingsPanel } from "./SystemSettingsPanel";
import "./settings.css";

type SettingsTab = "system" | "account";

const SETTINGS_TABS: { tab: SettingsTab; labelKey: string }[] = [
  { tab: "system", labelKey: "settings.menuSystem" },
  { tab: "account", labelKey: "settings.menuAccount" }
];

/** The settings route (#settingsView): a section menu with the "System" and "Account" panels, ported from the legacy settings view. */
export default function SettingsPage() {
  const t = useT();
  const [activeTab, setActiveTab] = useState<SettingsTab>("system");
  return (
    <section id="settingsView" className="tab-view">
      <div className="settings-layout flex flex-col gap-4 sm:flex-row sm:items-start">
        <nav
          id="settingsMenu"
          className="settings-menu flex shrink-0 gap-1 rounded-lg border border-line bg-muted p-1 sm:w-44 sm:flex-col"
          aria-label={t("settings.title")}
        >
          {SETTINGS_TABS.map(({ tab, labelKey }) => (
            <button
              key={tab}
              className={cn(
                "settings-menu-button flex-1 rounded-md px-3 py-2 text-sm font-semibold text-secondary sm:text-left",
                activeTab === tab && "is-active"
              )}
              type="button"
              data-settings-tab={tab}
              aria-current={activeTab === tab ? "page" : "false"}
              onClick={() => setActiveTab(tab)}
            >
              {t(labelKey)}
            </button>
          ))}
        </nav>
        <div className="settings-content min-w-0 w-full max-w-xl">
          <SystemSettingsPanel hidden={activeTab !== "system"} />
          <AccountSettingsPanel hidden={activeTab !== "account"} />
        </div>
      </div>
    </section>
  );
}

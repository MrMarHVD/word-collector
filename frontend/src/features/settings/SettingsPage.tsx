import { useT } from "@/lib/i18n";

/** Placeholder for the settings route; replaced by RX-009. */
export default function SettingsPage() {
  const t = useT();
  return (
    <section id="settingsView" className="tab-view">
      <h1 className="text-base font-bold">{t("tabs.settings")}</h1>
    </section>
  );
}

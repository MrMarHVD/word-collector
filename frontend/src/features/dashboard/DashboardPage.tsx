import { useT } from "@/lib/i18n";

/** Placeholder for the dashboard route; replaced by RX-004. */
export default function DashboardPage() {
  const t = useT();
  return (
    <section id="dashboardView" className="tab-view">
      <h1 className="text-base font-bold">{t("tabs.dashboard")}</h1>
    </section>
  );
}

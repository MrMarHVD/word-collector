import { useT } from "@/lib/i18n";

/** Placeholder for the admin route; replaced by RX-010. */
export default function AdminPage() {
  const t = useT();
  return (
    <section id="adminView" className="tab-view">
      <h1 className="text-base font-bold">{t("tabs.admin")}</h1>
    </section>
  );
}

import { useT } from "@/lib/i18n";

/** Placeholder for the collections route; replaced by RX-005. */
export default function CollectionsPage() {
  const t = useT();
  return (
    <section id="collectionsView" className="tab-view">
      <h1 className="text-base font-bold">{t("tabs.collections")}</h1>
    </section>
  );
}

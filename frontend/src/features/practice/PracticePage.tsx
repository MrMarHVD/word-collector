import { useT } from "@/lib/i18n";

/** Placeholder for the practice route; replaced by RX-008. */
export default function PracticePage() {
  const t = useT();
  return (
    <section id="practiceView" className="tab-view">
      <h1 className="text-base font-bold">{t("tabs.practice")}</h1>
    </section>
  );
}

import { useT } from "@/lib/i18n";

/** Placeholder for the reader route; replaced by RX-007. */
export default function ReaderPage() {
  const t = useT();
  return (
    <section id="readerView" className="tab-view">
      <h1 className="text-base font-bold">{t("tabs.reader")}</h1>
    </section>
  );
}

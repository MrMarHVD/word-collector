/** Route error screen: shown when a page fails to render or its chunk fails to load. */

import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";

/** Route-level errorElement with a localised message and a reload action. */
export function RouteError() {
  const t = useT();
  return (
    <div role="alert" className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-4 text-center">
      <p className="text-secondary">{t("common.error")}</p>
      <Button onClick={() => window.location.reload()}>{t("common.reload")}</Button>
    </div>
  );
}

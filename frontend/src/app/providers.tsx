import { useEffect, type ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { ConfirmProvider } from "@/components/app/ConfirmDialog";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useT } from "@/lib/i18n";
import { queryClient } from "@/lib/query-client";
import { useLocaleStore } from "@/stores/locale";

/** Keeps <html lang> and the document title in the active locale, as the legacy applyLocale did. */
function LocaleDocumentSync() {
  const t = useT();
  const locale = useLocaleStore((state) => state.locale);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = `${t("brand")} - ${t("app.title")}`;
  }, [locale, t]);
  return null;
}

/** App-wide providers: TanStack Query, tooltips, useConfirm() and the toast host. */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ConfirmProvider>
          <LocaleDocumentSync />
          {children}
          <Toaster />
        </ConfirmProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

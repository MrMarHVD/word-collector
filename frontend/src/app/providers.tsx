import { useEffect, type ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { domAnimation, LazyMotion, MotionConfig } from "motion/react";
import { ConfirmProvider } from "@/components/app/ConfirmDialog";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useReadingFont } from "@/lib/fonts";
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

/** App-wide providers: TanStack Query, motion (lazy `m` features, OS reduced-motion honoured), tooltips, useConfirm() and the toast host. */
export function AppProviders({ children }: { children: ReactNode }) {
  useReadingFont();
  return (
    <QueryClientProvider client={queryClient}>
      <LazyMotion features={domAnimation} strict>
        <MotionConfig reducedMotion="user">
          <TooltipProvider>
            <ConfirmProvider>
              <LocaleDocumentSync />
              {children}
              <Toaster />
            </ConfirmProvider>
          </TooltipProvider>
        </MotionConfig>
      </LazyMotion>
    </QueryClientProvider>
  );
}

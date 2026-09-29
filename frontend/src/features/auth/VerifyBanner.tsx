import { useState } from "react";
import { Button } from "@/components/ui/button";
import { api, errorMessage } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { useSessionStore } from "@/stores/session";
import { needsEmailVerification } from "./auth-status";
import "./auth.css";

/**
 * Email-verification banner (#verifyBanner with #verifyResendButton and
 * #verifyBannerStatus), rendered by AppShell under the menu bar for signed-in
 * users. Shows while `user.emailVerified` is false; its status text is the
 * session store's `verifyNotice` (resend outcome, verification result, logout error).
 */
export function VerifyBanner() {
  const t = useT();
  const user = useSessionStore((state) => state.user);
  const verifyNotice = useSessionStore((state) => state.verifyNotice);
  const setVerifyNotice = useSessionStore((state) => state.setVerifyNotice);
  const [sending, setSending] = useState(false);

  if (!needsEmailVerification(user)) {
    return null;
  }

  async function resend() {
    setSending(true);
    setVerifyNotice(t("verify.sending"));
    try {
      await api.auth.resendVerification();
      setVerifyNotice(t("verify.sent"));
    } catch (error) {
      setVerifyNotice(errorMessage(error));
    } finally {
      setSending(false);
    }
  }

  return (
    <div id="verifyBanner" className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-muted px-4 py-3 text-sm" role="status">
      <span className="flex-1 font-semibold text-label">{t("verify.bannerText")}</span>
      <Button id="verifyResendButton" className="h-auto min-h-9 px-3 py-0 text-white" type="button" disabled={sending} onClick={() => void resend()}>
        {t("verify.resend")}
      </Button>
      <span id="verifyBannerStatus" className="text-secondary" role="status">
        {verifyNotice}
      </span>
    </div>
  );
}

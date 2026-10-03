import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { api, errorMessage } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { useSessionStore } from "@/stores/session";
import { needsEmailVerification } from "./auth-status";

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
    <div id="verifyBanner" className="mb-4 flex flex-wrap items-center gap-3 rounded-container bg-subtle px-4 py-3" role="status">
      <Text variant="body" tone="label" className="flex-1 font-medium">
        {t("verify.bannerText")}
      </Text>
      <Button id="verifyResendButton" size="sm" disabled={sending} onClick={() => void resend()}>
        {t("verify.resend")}
      </Button>
      <Text as="span" id="verifyBannerStatus" variant="caption" tone="muted" role="status">
        {verifyNotice}
      </Text>
    </div>
  );
}

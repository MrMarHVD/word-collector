/**
 * Session bootstrap, ported from the tail of public/js/main.js. Emailed
 * verification/reset links and OAuth redirects land on the app with a query
 * parameter; it is consumed, stripped from the URL, and turned into session
 * store state that the auth feature renders.
 */

import { api, setUnauthorizedHandler } from "@/lib/api";
import { t } from "@/lib/i18n";
import { useSessionStore } from "@/stores/session";
import { startStudyLanguageSync } from "@/stores/study-language";

async function consumeVerificationToken(token: string): Promise<string> {
  try {
    await api.auth.verifyEmail(token);
    return t("verify.success");
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

function oauthErrorMessage(errorKey: string): string {
  const key = errorKey.startsWith("errors.") ? errorKey : `errors.${errorKey || "googleOAuthFailed"}`;
  return t(key, {}, t("errors.googleOAuthFailed"));
}

/** Wires 401 handling and cross-tab language sync, handles auth redirect parameters and loads the session. Call once. */
export async function bootstrapSession(): Promise<void> {
  const session = useSessionStore.getState();
  setUnauthorizedHandler(() => useSessionStore.getState().handleUnauthorized());
  startStudyLanguageSync(() => Boolean(useSessionStore.getState().user));

  const params = new URLSearchParams(window.location.search);
  const resetToken = params.get("reset_token");
  const verifyToken = params.get("verify_token");
  const oauthError = params.get("oauth_error");
  if (resetToken || verifyToken || oauthError || params.get("oauth")) {
    window.history.replaceState({}, "", window.location.pathname);
  }

  if (resetToken) {
    session.openAuthScreen({ panel: "reset", resetToken });
    session.markReady();
    return;
  }

  const verifyMessage = verifyToken ? await consumeVerificationToken(verifyToken) : null;
  let user = null;
  try {
    user = await session.loadSession();
  } catch {
    session.markReady();
  }
  if (verifyMessage !== null) {
    if (user) {
      session.setVerifyNotice(verifyMessage);
    } else {
      session.openAuthScreen({ panel: "login", mode: "login", status: verifyMessage });
    }
  } else if (oauthError !== null) {
    session.openAuthScreen({ panel: "login", mode: "login", status: oauthErrorMessage(oauthError) });
  }
}

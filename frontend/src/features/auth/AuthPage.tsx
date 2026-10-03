import { useState, type FormEvent, type ReactNode } from "react";
import { ChevronLeftIcon } from "lucide-react";
import { Segmented } from "@/components/app/Segmented";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Text } from "@/components/ui/text";
import { api, errorMessage } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { useSessionStore, type AuthScreen } from "@/stores/session";

/** Google "G" brand mark in Google's own colours: the documented brand-colour exception (CONTRACTS.md, "Documented exceptions"). */
function GoogleMark() {
  return (
    <svg data-brand-mark="google" aria-hidden="true" viewBox="0 0 48 48" className="size-4">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

/**
 * Status line and busy flag shared by the auth forms. `submit` disables the
 * form, shows the pending text, runs the request and shows its error on failure;
 * the action sets any success text itself.
 */
function useFormStatus(initialStatus = "") {
  const [status, setStatus] = useState(initialStatus);
  const [submitting, setSubmitting] = useState(false);

  async function submit(pendingStatus: string, action: () => Promise<void>) {
    setSubmitting(true);
    setStatus(pendingStatus);
    try {
      await action();
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  return { status, setStatus, submitting, submit };
}

function BackButton({ id, onClick }: { id: string; onClick: () => void }) {
  const t = useT();
  return (
    <Button id={id} variant="ghost" size="sm" className="-ml-3 justify-self-start" onClick={onClick}>
      <ChevronLeftIcon />
      <span>{t("auth.back")}</span>
    </Button>
  );
}

/** Auth card shell: an optional back button, the brand eyebrow, the title and the panel content. */
function AuthCard({ id, title, onBack, backId, children }: { id: string; title: string; onBack?: () => void; backId?: string; children: ReactNode }) {
  const t = useT();
  return (
    <Card id={id} className="w-full max-w-md">
      <CardHeader>
        {onBack && backId ? <BackButton id={backId} onClick={onBack} /> : null}
        <Text variant="caption" tone="muted">
          {t("brand")}
        </Text>
        <Text variant="title">{title}</Text>
      </CardHeader>
      <CardContent className="grid gap-4">{children}</CardContent>
    </Card>
  );
}

/** Login/register panel (#authLoginPanel). On success the session loads and the app shell replaces this screen. */
function LoginPanel({ screen }: { screen: AuthScreen }) {
  const t = useT();
  const authProviders = useSessionStore((state) => state.authProviders);
  const openAuthScreen = useSessionStore((state) => state.openAuthScreen);
  const closeAuthScreen = useSessionStore((state) => state.closeAuthScreen);
  const loadSession = useSessionStore((state) => state.loadSession);
  const { status, setStatus, submitting, submit } = useFormStatus(screen.status);
  const isRegister = screen.mode === "register";
  const googleEnabled = authProviders.google === true;

  function setMode(mode: AuthScreen["mode"]) {
    setStatus("");
    openAuthScreen({ panel: "login", mode });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const email = String(data.get("email") ?? "");
    const password = String(data.get("password") ?? "");
    await submit(t(isRegister ? "auth.registering" : "auth.loggingIn"), async () => {
      if (isRegister) {
        await api.auth.register({ email, password, confirmPassword: String(data.get("confirmPassword") ?? "") });
      } else {
        await api.auth.login({ email, password });
      }
      form.reset();
      await loadSession();
    });
  }

  return (
    <AuthCard id="authLoginPanel" title={t("auth.title")} backId="authBackButton" onBack={closeAuthScreen}>
      <Segmented
        aria-label={t("auth.title")}
        value={screen.mode}
        onValueChange={setMode}
        options={(["login", "register"] as const).map((mode) => ({
          value: mode,
          label: t(mode === "login" ? "auth.login" : "auth.register"),
          itemProps: { "data-auth-mode": mode }
        }))}
      />
      <form id="authForm" className="grid gap-4" onSubmit={handleSubmit}>
        <Field>
          <FieldLabel htmlFor="authEmail">{t("auth.email")}</FieldLabel>
          <Input id="authEmail" name="email" type="email" autoComplete="email" required />
        </Field>
        <Field>
          <FieldLabel htmlFor="authPassword">{t("auth.password")}</FieldLabel>
          <Input id="authPassword" name="password" type="password" autoComplete={isRegister ? "new-password" : "current-password"} required />
        </Field>
        <Text id="authPasswordRequirements" variant="caption" tone="muted" hidden={!isRegister}>
          {t("auth.passwordRequirements")}
        </Text>
        <Field id="authConfirmWrap" hidden={!isRegister}>
          <FieldLabel htmlFor="authConfirmPassword">{t("auth.confirmPassword")}</FieldLabel>
          <Input id="authConfirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required={isRegister} />
        </Field>
        <Button id="authSubmit" size="lg" className="w-full" type="submit" disabled={submitting}>
          {t(isRegister ? "auth.register" : "auth.login")}
        </Button>
        <Text id="authStatus" variant="caption" tone="muted" className="min-h-5" role="status">
          {status}
        </Text>
      </form>
      <div id="authDivider" className="grid grid-cols-[1fr_auto_1fr] items-center gap-3" hidden={!googleEnabled}>
        <Separator />
        <Text variant="caption" tone="muted">
          {t("auth.or")}
        </Text>
        <Separator />
      </div>
      <Button
        id="authGoogleButton"
        variant="secondary"
        size="lg"
        className="w-full"
        hidden={!googleEnabled}
        onClick={() => window.location.assign(api.auth.googleStartUrl())}
      >
        <GoogleMark />
        {t("auth.google")}
      </Button>
      <Button id="authForgotButton" variant="link" className="justify-self-start px-0" hidden={isRegister} onClick={() => openAuthScreen({ panel: "forgot" })}>
        {t("auth.forgotPassword")}
      </Button>
    </AuthCard>
  );
}

/** Forgot-password panel (#authForgotPanel). Always reports success, so it never reveals whether an account exists. */
function ForgotPanel() {
  const t = useT();
  const openAuthScreen = useSessionStore((state) => state.openAuthScreen);
  const { status, setStatus, submitting, submit } = useFormStatus();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const email = String(new FormData(form).get("email") ?? "");
    await submit(t("auth.sendingResetLink"), async () => {
      await api.auth.requestPasswordReset(email);
      setStatus(t("auth.resetLinkSent"));
      form.reset();
    });
  }

  return (
    <AuthCard id="authForgotPanel" title={t("auth.forgotTitle")} backId="authForgotBackButton" onBack={() => openAuthScreen({ panel: "login" })}>
      <Text tone="muted">{t("auth.forgotIntro")}</Text>
      <form id="forgotForm" className="grid gap-4" onSubmit={handleSubmit}>
        <Field>
          <FieldLabel htmlFor="forgotEmail">{t("auth.email")}</FieldLabel>
          <Input id="forgotEmail" name="email" type="email" autoComplete="email" required />
        </Field>
        <Button id="forgotSubmit" size="lg" className="w-full" type="submit" disabled={submitting}>
          {t("auth.sendResetLink")}
        </Button>
        <Text id="forgotStatus" variant="caption" tone="muted" className="min-h-5" role="status">
          {status}
        </Text>
      </form>
    </AuthCard>
  );
}

/** Reset-password panel (#authResetPanel), opened from an emailed link. On success it returns to login with a confirmation. */
function ResetPanel({ screen }: { screen: AuthScreen }) {
  const t = useT();
  const openAuthScreen = useSessionStore((state) => state.openAuthScreen);
  const { status, submitting, submit } = useFormStatus();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await submit(t("auth.updatingPassword"), async () => {
      await api.auth.resetPassword({
        token: screen.resetToken ?? "",
        password: String(data.get("password") ?? ""),
        confirmPassword: String(data.get("confirmPassword") ?? "")
      });
      openAuthScreen({ panel: "login", mode: "login", status: t("auth.passwordUpdated") });
    });
  }

  return (
    <AuthCard id="authResetPanel" title={t("auth.resetTitle")}>
      <form id="resetForm" className="grid gap-4" onSubmit={handleSubmit}>
        <Field>
          <FieldLabel htmlFor="resetPassword">{t("auth.newPassword")}</FieldLabel>
          <Input id="resetPassword" name="password" type="password" autoComplete="new-password" required />
        </Field>
        <Text variant="caption" tone="muted">
          {t("auth.passwordRequirements")}
        </Text>
        <Field>
          <FieldLabel htmlFor="resetConfirmPassword">{t("auth.confirmPassword")}</FieldLabel>
          <Input id="resetConfirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required />
        </Field>
        <Button id="resetSubmit" size="lg" className="w-full" type="submit" disabled={submitting}>
          {t("auth.updatePassword")}
        </Button>
        <Text id="resetStatus" variant="caption" tone="muted" className="min-h-5" role="status">
          {status}
        </Text>
      </form>
    </AuthCard>
  );
}

/**
 * The full-screen auth view (#authView), shown instead of the app shell while
 * the session store's `authScreen` is set. RX-002 ships the login/register
 * panel; RX-003 adds the forgot and reset password panels.
 */
export default function AuthPage() {
  const screen = useSessionStore((state) => state.authScreen);
  if (!screen) {
    return null;
  }
  return (
    <main id="authView" className="grid min-h-screen place-items-center px-4 py-8">
      {screen.panel === "login" ? <LoginPanel screen={screen} /> : null}
      {screen.panel === "forgot" ? <ForgotPanel /> : null}
      {screen.panel === "reset" ? <ResetPanel screen={screen} /> : null}
    </main>
  );
}

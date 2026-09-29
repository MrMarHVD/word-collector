import { useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useSessionStore, type AuthScreen } from "@/stores/session";
import { authErrorMessage } from "./auth-status";
import "./auth.css";

const INPUT_CLASS = "min-h-11 rounded-md border border-line bg-panel px-3 text-main outline-none focus:border-brand focus:ring-2 focus:ring-focus";
const PANEL_CLASS = "auth-panel w-full max-w-md rounded-lg border border-line bg-panel p-6 shadow-panel";
const LABEL_CLASS = "grid gap-1.5 text-sm font-semibold text-label";
const SUBMIT_CLASS = "min-h-11 w-full rounded-md bg-brand px-4 text-sm font-bold text-white hover:bg-brand-strong";
const STATUS_CLASS = "status min-h-5 text-sm text-secondary";

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
      setStatus(authErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  return { status, setStatus, submitting, submit };
}

function BackButton({ id, onClick }: { id: string; onClick: () => void }) {
  const t = useT();
  return (
    <button id={id} className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-secondary hover:text-brand" type="button" onClick={onClick}>
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-[2]">
        <path d="M15 6l-6 6 6 6" />
      </svg>
      <span>{t("auth.back")}</span>
    </button>
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
    <section id="authLoginPanel" className={PANEL_CLASS}>
      <BackButton id="authBackButton" onClick={closeAuthScreen} />
      <p className="eyebrow mb-2 text-xs font-bold uppercase text-brand">{t("brand")}</p>
      <h1 className="text-3xl font-bold tracking-tight">{t("auth.title")}</h1>
      <div className="auth-tabs my-5 grid grid-cols-2 gap-1 rounded-lg border border-line bg-muted p-1">
        {(["login", "register"] as const).map((mode) => (
          <button
            key={mode}
            className={cn("auth-mode-button rounded-md px-4 py-2 text-sm font-semibold text-secondary", screen.mode === mode && "is-active")}
            type="button"
            data-auth-mode={mode}
            aria-pressed={screen.mode === mode}
            onClick={() => setMode(mode)}
          >
            {t(mode === "login" ? "auth.login" : "auth.register")}
          </button>
        ))}
      </div>
      <form id="authForm" className="grid gap-4" onSubmit={handleSubmit}>
        <label className={LABEL_CLASS}>
          <span>{t("auth.email")}</span>
          <input id="authEmail" name="email" className={INPUT_CLASS} type="email" autoComplete="email" required />
        </label>
        <label className={LABEL_CLASS}>
          <span>{t("auth.password")}</span>
          <input
            id="authPassword"
            name="password"
            className={INPUT_CLASS}
            type="password"
            autoComplete={isRegister ? "new-password" : "current-password"}
            required
          />
        </label>
        <p id="authPasswordRequirements" className="text-sm text-secondary" hidden={!isRegister}>
          {t("auth.passwordRequirements")}
        </p>
        <label id="authConfirmWrap" className={LABEL_CLASS} hidden={!isRegister}>
          <span>{t("auth.confirmPassword")}</span>
          <input id="authConfirmPassword" name="confirmPassword" className={INPUT_CLASS} type="password" autoComplete="new-password" required={isRegister} />
        </label>
        <button id="authSubmit" className={SUBMIT_CLASS} type="submit" disabled={submitting}>
          {t(isRegister ? "auth.register" : "auth.login")}
        </button>
        <p id="authStatus" className={STATUS_CLASS} role="status">
          {status}
        </p>
      </form>
      <div
        id="authDivider"
        className="my-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-xs font-semibold uppercase text-secondary"
        hidden={!googleEnabled}
      >
        <span className="h-px bg-line" />
        <span>{t("auth.or")}</span>
        <span className="h-px bg-line" />
      </div>
      <button
        id="authGoogleButton"
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-line bg-panel px-4 text-sm font-bold text-main hover:bg-hover"
        type="button"
        hidden={!googleEnabled}
        onClick={() => window.location.assign(api.auth.googleStartUrl())}
      >
        <span className="grid h-5 w-5 place-items-center rounded-full bg-white text-sm font-black text-[#4285F4]" aria-hidden="true">
          G
        </span>
        <span>{t("auth.google")}</span>
      </button>
      <button
        id="authForgotButton"
        className="mt-2 text-sm font-semibold text-brand hover:text-brand-strong"
        type="button"
        hidden={isRegister}
        onClick={() => openAuthScreen({ panel: "forgot" })}
      >
        {t("auth.forgotPassword")}
      </button>
    </section>
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
    <section id="authForgotPanel" className={PANEL_CLASS}>
      <BackButton id="authForgotBackButton" onClick={() => openAuthScreen({ panel: "login" })} />
      <p className="eyebrow mb-2 text-xs font-bold uppercase text-brand">{t("brand")}</p>
      <h1 className="text-3xl font-bold tracking-tight">{t("auth.forgotTitle")}</h1>
      <p className="mt-2 text-sm text-secondary">{t("auth.forgotIntro")}</p>
      <form id="forgotForm" className="mt-5 grid gap-4" onSubmit={handleSubmit}>
        <label className={LABEL_CLASS}>
          <span>{t("auth.email")}</span>
          <input id="forgotEmail" name="email" className={INPUT_CLASS} type="email" autoComplete="email" required />
        </label>
        <button id="forgotSubmit" className={SUBMIT_CLASS} type="submit" disabled={submitting}>
          {t("auth.sendResetLink")}
        </button>
        <p id="forgotStatus" className={STATUS_CLASS} role="status">
          {status}
        </p>
      </form>
    </section>
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
    <section id="authResetPanel" className={PANEL_CLASS}>
      <p className="eyebrow mb-2 text-xs font-bold uppercase text-brand">{t("brand")}</p>
      <h1 className="text-3xl font-bold tracking-tight">{t("auth.resetTitle")}</h1>
      <form id="resetForm" className="mt-5 grid gap-4" onSubmit={handleSubmit}>
        <label className={LABEL_CLASS}>
          <span>{t("auth.newPassword")}</span>
          <input id="resetPassword" name="password" className={INPUT_CLASS} type="password" autoComplete="new-password" required />
        </label>
        <p className="text-sm text-secondary">{t("auth.passwordRequirements")}</p>
        <label className={LABEL_CLASS}>
          <span>{t("auth.confirmPassword")}</span>
          <input id="resetConfirmPassword" name="confirmPassword" className={INPUT_CLASS} type="password" autoComplete="new-password" required />
        </label>
        <button id="resetSubmit" className={SUBMIT_CLASS} type="submit" disabled={submitting}>
          {t("auth.updatePassword")}
        </button>
        <p id="resetStatus" className={STATUS_CLASS} role="status">
          {status}
        </p>
      </form>
    </section>
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
    <main id="authView" className="auth-shell grid min-h-screen place-items-center px-4 py-8">
      {screen.panel === "login" ? <LoginPanel screen={screen} /> : null}
      {screen.panel === "forgot" ? <ForgotPanel /> : null}
      {screen.panel === "reset" ? <ResetPanel screen={screen} /> : null}
    </main>
  );
}

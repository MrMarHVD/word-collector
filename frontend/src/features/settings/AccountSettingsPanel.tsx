import { useEffect, useRef, useState, type FormEvent } from "react";
import { useConfirm } from "@/components/app/ConfirmDialog";
import { api, errorMessage } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { useLocaleStore } from "@/stores/locale";
import { useSessionStore } from "@/stores/session";
import { accountDetailRows, deleteConfirmationMatches } from "./settings-logic";

const INPUT_CLASS = "min-h-11 rounded-md border border-line bg-panel px-3 text-main outline-none focus:border-brand focus:ring-2 focus:ring-focus";

/** Collapsible change-password form (#changePasswordSection); only rendered for accounts with a password. */
function ChangePasswordSection() {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const [status, setStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const currentPasswordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (expanded) {
      currentPasswordRef.current?.focus();
    }
  }, [expanded]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setStatus(t("settings.updatingPassword"));
    setSubmitting(true);
    try {
      await api.settings.changePassword({
        currentPassword: String(data.get("currentPassword") ?? ""),
        newPassword: String(data.get("newPassword") ?? ""),
        confirmPassword: String(data.get("confirmPassword") ?? "")
      });
      form.reset();
      setStatus(t("settings.passwordUpdated"));
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div id="changePasswordSection" className="mt-8 rounded-md border border-line bg-panel shadow-sm">
      <div className="border-b border-line px-3 py-2">
        <h3 className="text-sm font-bold text-main">{t("settings.securityTitle")}</h3>
      </div>
      <button
        id="changePasswordToggle"
        className="flex min-h-12 w-full items-center justify-between gap-3 px-3 text-left text-sm font-bold text-main hover:bg-hover"
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
      >
        <span>{t("settings.passwordTitle")}</span>
        <span className="text-base leading-none text-secondary" aria-hidden="true">
          +
        </span>
      </button>
      <form id="changePasswordForm" className="grid gap-4 border-t border-line bg-panel p-3" hidden={!expanded} onSubmit={handleSubmit}>
        <p className="text-sm text-secondary">{t("auth.passwordRequirements")}</p>
        <label className="grid gap-1.5 text-sm font-semibold text-label">
          <span>{t("settings.currentPassword")}</span>
          <input
            ref={currentPasswordRef}
            id="currentPassword"
            name="currentPassword"
            className={INPUT_CLASS}
            type="password"
            autoComplete="current-password"
            required
          />
        </label>
        <label className="grid gap-1.5 text-sm font-semibold text-label">
          <span>{t("auth.newPassword")}</span>
          <input id="newPassword" name="newPassword" className={INPUT_CLASS} type="password" autoComplete="new-password" required />
        </label>
        <label className="grid gap-1.5 text-sm font-semibold text-label">
          <span>{t("auth.confirmPassword")}</span>
          <input id="confirmNewPassword" name="confirmPassword" className={INPUT_CLASS} type="password" autoComplete="new-password" required />
        </label>
        <button className="min-h-11 rounded-md bg-brand px-4 text-sm font-bold text-white hover:bg-brand-strong" type="submit" disabled={submitting}>
          {t("settings.updatePassword")}
        </button>
        <p id="changePasswordStatus" className="status min-h-5 text-sm text-secondary" role="status">
          {status}
        </p>
      </form>
    </div>
  );
}

/**
 * Danger zone (#deleteAccountSection): the delete button unlocks once the
 * account email is typed, then an in-app confirmation precedes the deletion.
 * On success the session is cleared (forgetting the study language) and the
 * welcome screen shows in place.
 */
function DeleteAccountSection({ email }: { email: string }) {
  const t = useT();
  const confirm = useConfirm();
  const clearSession = useSessionStore((state) => state.clearSession);
  const [expanded, setExpanded] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [status, setStatus] = useState("");
  const [deleting, setDeleting] = useState(false);
  const confirmationRef = useRef<HTMLInputElement>(null);
  const matches = deleteConfirmationMatches(email, confirmation);

  useEffect(() => {
    if (expanded) {
      confirmationRef.current?.focus();
    }
  }, [expanded]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!matches) {
      setStatus(t("errors.accountDeletionConfirmationMismatch"));
      return;
    }
    const confirmed = await confirm({
      title: t("settings.deleteAccountFinalConfirm"),
      confirmLabel: t("settings.deleteAccountButton"),
      destructive: true
    });
    if (!confirmed) {
      return;
    }
    setStatus(t("settings.deletingAccount"));
    setDeleting(true);
    try {
      await api.settings.deleteAccount(confirmation);
      clearSession({ forgetStudyLanguage: true });
    } catch (error) {
      setStatus(errorMessage(error));
      setDeleting(false);
    }
  }

  return (
    <section id="deleteAccountSection" className="delete-account-section mt-8 rounded-md border shadow-sm">
      <button
        id="deleteAccountToggle"
        className="delete-account-toggle flex min-h-12 w-full items-center justify-between gap-3 px-3 text-left text-sm font-bold hover:bg-hover"
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
      >
        <span>{t("settings.dangerZoneTitle")}</span>
        <span className="text-base leading-none text-secondary" aria-hidden="true">
          +
        </span>
      </button>
      <div id="deleteAccountPanel" className="delete-account-panel grid gap-4 border-t p-4" hidden={!expanded}>
        <div className="grid gap-1">
          <h3 className="text-sm font-bold">{t("settings.deleteAccountTitle")}</h3>
          <p className="text-sm text-secondary">{t("settings.deleteAccountDescription")}</p>
        </div>
        <form id="deleteAccountForm" className="grid gap-3" onSubmit={handleSubmit}>
          <label className="grid gap-1.5 text-sm font-semibold text-label">
            <span>{t("settings.deleteAccountConfirmLabel")}</span>
            <input
              ref={confirmationRef}
              id="deleteAccountConfirmation"
              className={INPUT_CLASS}
              type="email"
              autoComplete="off"
              spellCheck={false}
              required
              placeholder={t("settings.deleteAccountConfirmPlaceholder")}
              value={confirmation}
              onChange={(event) => {
                setStatus("");
                setConfirmation(event.target.value);
              }}
            />
          </label>
          <button
            id="deleteAccountSubmit"
            className="delete-account-button min-h-11 rounded-md px-4 text-sm font-bold"
            type="submit"
            disabled={!matches || deleting}
          >
            {t("settings.deleteAccountButton")}
          </button>
          <p id="deleteAccountStatus" className="status min-h-5 text-sm text-secondary" role="status">
            {status}
          </p>
        </form>
      </div>
    </section>
  );
}

/** The "Account" panel: account details, change password (password accounts only) and account deletion. */
export function AccountSettingsPanel({ hidden }: { hidden: boolean }) {
  const t = useT();
  const locale = useLocaleStore((state) => state.locale);
  const user = useSessionStore((state) => state.user);
  return (
    <section className="settings-panel rounded-lg border border-line bg-panel p-5 shadow-panel" data-settings-panel="account" hidden={hidden}>
      <div className="section-head mb-4 flex min-h-8 items-center justify-between gap-3">
        <h2 className="text-base font-bold">{t("settings.accountDetailsTitle")}</h2>
      </div>
      <dl id="accountDetails" className="grid gap-3 text-sm">
        {accountDetailRows(user, t, locale).map((row) => (
          <div key={row.labelKey} className="grid gap-1 rounded-md border border-line bg-muted px-3 py-2">
            <dt className="text-xs font-semibold uppercase text-secondary">{t(row.labelKey)}</dt>
            <dd className="break-words font-semibold text-main">{row.value}</dd>
          </div>
        ))}
      </dl>
      {user?.hasPassword === true ? <ChangePasswordSection /> : null}
      <DeleteAccountSection email={user?.email ?? ""} />
    </section>
  );
}

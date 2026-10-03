import { useState, type FormEvent } from "react";
import { useConfirm } from "@/components/app/ConfirmDialog";
import { SettingRow, SettingSection } from "@/components/app/SettingRow";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { api, errorMessage } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { useLocaleStore } from "@/stores/locale";
import { useSessionStore } from "@/stores/session";
import { accountDetailRows, deleteConfirmationMatches } from "./settings-logic";

/** Change-password row (#changePasswordSection) opening a dialog with the form; only rendered for accounts with a password. */
function ChangePasswordSection() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setStatus("");
    }
  }

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
    <>
      <SettingSection id="changePasswordSection" title={t("settings.securityTitle")}>
        <SettingRow label={t("settings.passwordTitle")}>
          <Button id="changePasswordToggle" type="button" variant="secondary" size="lg" onClick={() => setOpen(true)}>
            {t("settings.changePasswordButton")}
          </Button>
        </SettingRow>
      </SettingSection>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("settings.passwordTitle")}</DialogTitle>
            <DialogDescription>{t("auth.passwordRequirements")}</DialogDescription>
          </DialogHeader>
          <form id="changePasswordForm" className="grid gap-4" onSubmit={handleSubmit}>
            <Field>
              <FieldLabel htmlFor="currentPassword">{t("settings.currentPassword")}</FieldLabel>
              <Input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required />
            </Field>
            <Field>
              <FieldLabel htmlFor="newPassword">{t("auth.newPassword")}</FieldLabel>
              <Input id="newPassword" name="newPassword" type="password" autoComplete="new-password" required />
            </Field>
            <Field>
              <FieldLabel htmlFor="confirmNewPassword">{t("auth.confirmPassword")}</FieldLabel>
              <Input id="confirmNewPassword" name="confirmPassword" type="password" autoComplete="new-password" required />
            </Field>
            <p id="changePasswordStatus" className="min-h-5 text-caption text-secondary" role="status">
              {status}
            </p>
            <DialogFooter>
              <Button type="submit" size="lg" disabled={submitting}>
                {t("settings.updatePassword")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Danger zone (#deleteAccountSection): the destructive button opens a dialog
 * (#deleteAccountPanel) whose delete button unlocks once the account email is
 * typed, then an in-app confirmation precedes the deletion. On success the
 * session is cleared (forgetting the study language) and the welcome screen
 * shows in place.
 */
function DeleteAccountSection({ email }: { email: string }) {
  const t = useT();
  const confirm = useConfirm();
  const clearSession = useSessionStore((state) => state.clearSession);
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [status, setStatus] = useState("");
  const [deleting, setDeleting] = useState(false);
  const matches = deleteConfirmationMatches(email, confirmation);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setConfirmation("");
      setStatus("");
    }
  }

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
    <>
      <SettingSection id="deleteAccountSection" title={t("settings.dangerZoneTitle")}>
        <SettingRow label={t("settings.deleteAccountTitle")} description={t("settings.deleteAccountDescription")}>
          <Button id="deleteAccountToggle" type="button" variant="destructive" size="lg" onClick={() => setOpen(true)}>
            {t("settings.deleteAccountButton")}
          </Button>
        </SettingRow>
      </SettingSection>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent id="deleteAccountPanel">
          <DialogHeader>
            <DialogTitle>{t("settings.deleteAccountTitle")}</DialogTitle>
            <DialogDescription>{t("settings.deleteAccountDescription")}</DialogDescription>
          </DialogHeader>
          <form id="deleteAccountForm" className="grid gap-4" onSubmit={handleSubmit}>
            <Field>
              <FieldLabel htmlFor="deleteAccountConfirmation">{t("settings.deleteAccountConfirmLabel")}</FieldLabel>
              <Input
                id="deleteAccountConfirmation"

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
            </Field>
            <p id="deleteAccountStatus" className="min-h-5 text-caption text-secondary" role="status">
              {status}
            </p>
            <DialogFooter>
              <Button id="deleteAccountSubmit" type="submit" variant="destructive" size="lg" disabled={!matches || deleting}>
                {t("settings.deleteAccountButton")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** The "Account" panel: account details, change password (password accounts only) and account deletion. */
export function AccountSettingsPanel() {
  const t = useT();
  const locale = useLocaleStore((state) => state.locale);
  const user = useSessionStore((state) => state.user);
  return (
    <div className="grid gap-6">
      <SettingSection id="accountDetails" title={t("settings.accountDetailsTitle")}>
        {accountDetailRows(user, t, locale).map((row) => (
          <SettingRow key={row.labelKey} label={t(row.labelKey)}>
            <span className="break-words text-right text-body font-medium text-main mobile:max-w-52 mobile:break-all">{row.value}</span>
          </SettingRow>
        ))}
      </SettingSection>
      {user?.hasPassword === true ? <ChangePasswordSection /> : null}
      <DeleteAccountSection email={user?.email ?? ""} />
    </div>
  );
}

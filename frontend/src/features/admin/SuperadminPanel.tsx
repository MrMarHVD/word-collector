import { useState, type FormEvent } from "react";
import { m } from "motion/react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Text } from "@/components/ui/text";
import { api, errorMessage, queryKeys, type AuditEntry } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { MOTION_FADE } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { useLocaleStore } from "@/stores/locale";
import { auditActionKey, auditSnapshotKey, formatAuditTimestamp } from "./admin-logic";
import { useAdminViewStore } from "./admin-view-store";
import { useAuditLog } from "./queries";

// Labels wrap on narrow screens instead of widening the panel (legacy buttons wrapped).
const ACTION_BUTTON_CLASS = "h-auto min-h-9 shrink whitespace-normal";

/** One audit-log entry: action, time, actor, target and the before/after admin snapshot. */
function AuditEntryItem({ entry }: { entry: AuditEntry }) {
  const t = useT();
  const locale = useLocaleStore((state) => state.locale);
  const actionKey = auditActionKey(entry.action);
  return (
    <m.li
      className="grid gap-1 border-b border-line px-1 py-3 last:border-b-0"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={MOTION_FADE}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium text-main">{actionKey ? t(actionKey) : entry.action}</span>
        <span className="text-caption text-secondary">{formatAuditTimestamp(entry.createdAt, locale)}</span>
      </div>
      <div className="text-caption text-secondary">
        {t("admin.superadminAuditActor", { actor: entry.actorEmail || t("admin.superadminAuditUnknownActor") })}
      </div>
      <div className="text-caption text-secondary">{t("admin.superadminAuditTarget", { target: entry.target || t("admin.superadminSnapshotNone") })}</div>
      <div className="text-caption text-secondary">
        {t("admin.superadminAuditChange", { before: t(auditSnapshotKey(entry.before)), after: t(auditSnapshotKey(entry.after)) })}
      </div>
    </m.li>
  );
}

/** The paginated, read-only audit log (#superadminAuditLog). The page is kept across entries. */
function AuditLog() {
  const t = useT();
  const page = useAdminViewStore((state) => state.auditPage);
  const setPage = useAdminViewStore((state) => state.setAuditPage);
  const audit = useAuditLog(page);
  const data = audit.data;

  let content = null;
  if (audit.isError) {
    content = <p className="text-body text-danger">{errorMessage(audit.error)}</p>;
  } else if (data && !data.entries.length) {
    content = <Text tone="muted">{t("admin.superadminAuditEmpty")}</Text>;
  } else if (data) {
    content = (
      <>
        <ul>
          {data.entries.map((entry) => (
            <AuditEntryItem key={entry.id} entry={entry} />
          ))}
        </ul>
        <div className="mt-3 flex items-center justify-between gap-2">
          <Button id="superadminAuditPrev" variant="secondary" type="button" disabled={data.page <= 1} onClick={() => setPage(data.page - 1)}>
            {t("admin.superadminAuditPrev")}
          </Button>
          <span className="text-caption text-secondary">{t("admin.superadminAuditPageInfo", { page: data.page, totalPages: data.totalPages })}</span>
          <Button id="superadminAuditNext" variant="secondary" type="button" disabled={data.page >= data.totalPages} onClick={() => setPage(data.page + 1)}>
            {t("admin.superadminAuditNext")}
          </Button>
        </div>
      </>
    );
  }

  return <div id="superadminAuditLog">{content}</div>;
}

/**
 * Superadmin subtab (#adminSuperadminPanel content): grant or revoke the admin
 * flag by email, then the audit log. There is deliberately no control for the
 * superadmin's own flag; the server enforces every rule.
 */
export function SuperadminPanel() {
  const t = useT();
  const queryClient = useQueryClient();
  const setAuditPage = useAdminViewStore((state) => state.setAuditPage);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<{ text: string; error: boolean }>({ text: "", error: false });

  async function submitMutation(action: "grant" | "revoke") {
    const target = email.trim();
    if (!target) {
      return;
    }
    try {
      const result = action === "grant" ? await api.admin.grantAdmin(target) : await api.admin.revokeAdmin(target);
      setStatus({ text: t(action === "grant" ? "admin.superadminGrantSuccess" : "admin.superadminRevokeSuccess", { email: result.user.email }), error: false });
      setAuditPage(1);
      await queryClient.invalidateQueries({ queryKey: queryKeys.admin.audit(1) });
    } catch (error) {
      setStatus({ text: errorMessage(error), error: true });
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submitMutation("grant");
  }

  return (
    <div className="grid gap-6">
      <section className="grid gap-3">
        <div className="grid gap-1">
          <Text variant="heading">{t("admin.superadminManageTitle")}</Text>
          <Text tone="muted">{t("admin.superadminManageDescription")}</Text>
        </div>
        <form id="superadminGrantForm" className="flex flex-col gap-2 desktop:flex-row desktop:items-end" onSubmit={handleSubmit}>
          <Label className="grid flex-1 gap-1.5 text-caption font-medium text-label">
            <span>{t("admin.superadminEmailLabel")}</span>
            <Input
              id="superadminEmailInput"
              type="email"
              autoComplete="off"
              spellCheck={false}
              required
              placeholder={t("admin.superadminEmailPlaceholder")}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Label>
          <div className="flex gap-2">
            <Button id="superadminGrantButton" className={ACTION_BUTTON_CLASS} type="submit">
              {t("admin.superadminGrantButton")}
            </Button>
            <Button id="superadminRevokeButton" className={ACTION_BUTTON_CLASS} variant="secondary" type="button" onClick={() => void submitMutation("revoke")}>
              {t("admin.superadminRevokeButton")}
            </Button>
          </div>
        </form>
        <Text id="superadminStatus" className={cn("min-h-5", status.error && "text-danger")} tone="muted" role="status">
          {status.text}
        </Text>
      </section>

      <section className="grid gap-3">
        <div className="grid gap-1">
          <Text variant="heading">{t("admin.superadminAuditTitle")}</Text>
          <Text tone="muted">{t("admin.superadminAuditDescription")}</Text>
        </div>
        <AuditLog />
      </section>
    </div>
  );
}

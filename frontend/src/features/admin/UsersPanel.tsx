import { useState, type FormEvent, type UIEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AdminUser } from "@/lib/api";
import { useFormatCount, useT } from "@/lib/i18n";
import { useSessionStore } from "@/stores/session";
import { bytesToMb, canEditUser, isNearListEnd, limitInputValues, limitsRequest, usersQueryParams } from "./admin-logic";
import { useAdminViewStore } from "./admin-view-store";
import { useDebouncedValue } from "./use-debounced-value";
import { useAdminUsers, useSaveUserLimits } from "./queries";

const SEARCH_DEBOUNCE_MS = 200;
const FIELD_INPUT_CLASS = "h-11 bg-panel text-main";
const LIMIT_INPUT_CLASS = "h-9 w-24 bg-panel px-2 text-sm text-main";

/** Formats a row's join date like the legacy panel (browser locale). */
function formatDate(iso: string): string {
  return iso ? new Date(iso).toLocaleDateString() : "";
}

/**
 * Inline limit-override form for one row, disabled when the viewer may not
 * edit it. Its fields reset to the row's stored overrides whenever the row
 * changes (after a save or clear).
 */
function UserLimitsForm({ row, editable, onSave }: { row: AdminUser; editable: boolean; onSave: (body: ReturnType<typeof limitsRequest>) => void }) {
  const t = useT();
  const [values, setValues] = useState(() => limitInputValues(row));
  const [shownRow, setShownRow] = useState(row);
  if (shownRow !== row) {
    setShownRow(row);
    setValues(limitInputValues(row));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave(limitsRequest(values.materials, values.uploadMb));
  }

  return (
    <form className="flex flex-wrap items-end gap-2" data-admin-user-limits-form data-user-id={row.id} onSubmit={handleSubmit}>
      <label className="grid gap-1 text-xs font-semibold text-label">
        <span>{t("admin.usersMaxMaterials")}</span>
        <Input
          className={LIMIT_INPUT_CLASS}
          type="number"
          min="0"
          step="1"
          inputMode="numeric"
          data-limit-materials
          value={values.materials}
          placeholder={t("admin.usersDefaultPlaceholder")}
          disabled={!editable}
          onChange={(event) => setValues({ ...values, materials: event.target.value })}
        />
      </label>
      <label className="grid gap-1 text-xs font-semibold text-label">
        <span>{t("admin.usersMaxUploadMb")}</span>
        <Input
          className={LIMIT_INPUT_CLASS}
          type="number"
          min="0"
          step="1"
          inputMode="numeric"
          data-limit-upload-mb
          value={values.uploadMb}
          placeholder={t("admin.usersDefaultPlaceholder")}
          disabled={!editable}
          onChange={(event) => setValues({ ...values, uploadMb: event.target.value })}
        />
      </label>
      <Button className="px-3" type="submit" disabled={!editable}>
        {t("admin.usersSaveLimits")}
      </Button>
      <Button
        className="px-3"
        variant="outline"
        type="button"
        data-admin-user-clear
        data-user-id={row.id}
        disabled={!editable}
        onClick={() => onSave({ maxMaterials: null, maxUploadBytes: null })}
      >
        {t("admin.usersClearLimits")}
      </Button>
    </form>
  );
}

/** One user row: identity, privilege badge, join date, effective limits and document count, then the limits form. */
function UserRow({ row, editable, onSave }: { row: AdminUser; editable: boolean; onSave: (body: ReturnType<typeof limitsRequest>) => void }) {
  const t = useT();
  const formatCount = useFormatCount();
  const badgeKey = row.isSuperadmin ? "admin.usersSuperadminBadge" : row.isAdmin ? "admin.usersAdminBadge" : null;
  return (
    <div className="grid gap-2 rounded-md border border-line bg-muted p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1 truncate font-semibold text-main">{row.email}</span>
        {badgeKey ? (
          <Badge variant="secondary" className="font-bold text-brand">
            {t(badgeKey)}
          </Badge>
        ) : null}
        <span className="text-xs text-secondary">{t("admin.usersCreatedOn", { date: formatDate(row.createdAt) })}</span>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-secondary">
        <span>{t("admin.usersEffectiveMaterials", { count: formatCount(row.maxMaterials) })}</span>
        <span>{t("admin.usersEffectiveUpload", { mb: formatCount(bytesToMb(row.maxUploadBytes)) })}</span>
        <span>{t("admin.usersMaterialCount", { count: formatCount(row.materialCount) })}</span>
      </div>
      <UserLimitsForm row={row} editable={editable} onSave={onSave} />
    </div>
  );
}

/**
 * Admin → Users (#adminUsersPanel content): email search, join-date filter,
 * sort toggle, an infinite-scrolling list and per-row limit overrides. Search
 * and filter reset on every entry; the sort is kept.
 */
export function UsersPanel() {
  const t = useT();
  const viewer = useSessionStore((state) => state.user);
  const sort = useAdminViewStore((state) => state.usersSort);
  const setSort = useAdminViewStore((state) => state.setUsersSort);
  const [search, setSearch] = useState("");
  const [createdAfter, setCreatedAfter] = useState("");
  const [status, setStatus] = useState("");
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS);
  const filters = usersQueryParams(sort, debouncedSearch, createdAfter);
  const users = useAdminUsers(filters);
  const saveLimits = useSaveUserLimits(filters);
  const rows = users.data?.pages.flatMap((page) => page.users) ?? null;

  async function handleSave(userId: number, body: ReturnType<typeof limitsRequest>) {
    try {
      await saveLimits(userId, body);
      setStatus(t("admin.usersLimitsSaved"));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  function handleScroll(event: UIEvent<HTMLDivElement>) {
    if (isNearListEnd(event.currentTarget) && users.hasNextPage && !users.isFetching) {
      void users.fetchNextPage();
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-3 desktop:flex-row desktop:items-end">
        <label className="grid flex-1 gap-1.5 text-sm font-semibold text-label">
          <span>{t("admin.usersSearchLabel")}</span>
          <Input
            className={FIELD_INPUT_CLASS}
            type="search"
            autoComplete="off"
            spellCheck={false}
            data-admin-users-search
            placeholder={t("admin.usersSearchPlaceholder")}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <label className="grid gap-1.5 text-sm font-semibold text-label">
          <span>{t("admin.usersCreatedAfterLabel")}</span>
          <Input
            className={FIELD_INPUT_CLASS}
            type="date"
            data-admin-users-created-after
            value={createdAfter}
            onChange={(event) => setCreatedAfter(event.target.value)}
          />
        </label>
        <Button className="h-11" variant="outline" type="button" data-admin-users-sort onClick={() => setSort(sort === "email" ? "created_at" : "email")}>
          {t(sort === "created_at" ? "admin.usersSortByDate" : "admin.usersSortByEmail")}
        </Button>
      </div>
      <div className="admin-users-list grid max-h-[28rem] gap-2 overflow-y-auto" data-admin-users-list onScroll={handleScroll}>
        {rows && !rows.length ? <p className="p-3 text-sm text-secondary">{t("admin.usersEmpty")}</p> : null}
        {rows?.map((row) => (
          <UserRow key={row.id} row={row} editable={canEditUser(viewer, row)} onSave={(body) => void handleSave(row.id, body)} />
        ))}
        {rows && rows.length > 0 && users.hasNextPage ? <p className="p-2 text-center text-xs text-secondary">{t("admin.usersScrollForMore")}</p> : null}
      </div>
      <p className="status min-h-5 text-sm text-secondary" role="status" data-admin-users-status>
        {users.isError ? users.error.message : status}
      </p>
    </div>
  );
}

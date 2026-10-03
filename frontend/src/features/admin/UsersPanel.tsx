import { useState, type FormEvent, type UIEvent } from "react";
import { m } from "motion/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Text } from "@/components/ui/text";
import { ListRow } from "@/components/app/ListRow";
import { errorMessage, type AdminUser } from "@/lib/api";
import { useFormatCount, useT } from "@/lib/i18n";
import { MOTION_FADE } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { useSessionStore } from "@/stores/session";
import { bytesToMb, canEditUser, isNearListEnd, limitInputValues, limitsRequest, usersQueryParams } from "./admin-logic";
import { useAdminViewStore } from "./admin-view-store";
import { useDebouncedValue } from "./use-debounced-value";
import { useAdminUsers, useSaveUserLimits } from "./queries";

const SEARCH_DEBOUNCE_MS = 200;
const LIMIT_INPUT_CLASS = "w-24";
const FIELD_LABEL_CLASS = "grid gap-1.5 text-caption font-medium text-label";

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
      <Label className={FIELD_LABEL_CLASS}>
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
      </Label>
      <Label className={FIELD_LABEL_CLASS}>
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
      </Label>
      <Button type="submit" disabled={!editable}>
        {t("admin.usersSaveLimits")}
      </Button>
      <Button
        variant="secondary"
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
    <m.div className="border-b border-line last:border-b-0" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={MOTION_FADE}>
      <ListRow
        className="border-b-0"
        title={<span data-admin-user-email>{row.email}</span>}
        meta={
          <span className="flex flex-wrap gap-x-2.5">
            <span>{t("admin.usersEffectiveMaterials", { count: formatCount(row.maxMaterials) })}</span>
            <span>{t("admin.usersEffectiveUpload", { mb: formatCount(bytesToMb(row.maxUploadBytes)) })}</span>
            <span>{t("admin.usersMaterialCount", { count: formatCount(row.materialCount) })}</span>
            <span className="hidden mobile:inline">{t("admin.usersCreatedOn", { date: formatDate(row.createdAt) })}</span>
          </span>
        }
        trailing={
          <>
            {badgeKey ? <Badge variant="accent">{t(badgeKey)}</Badge> : null}
            <span className="mobile:hidden">{t("admin.usersCreatedOn", { date: formatDate(row.createdAt) })}</span>
          </>
        }
        below={<UserLimitsForm row={row} editable={editable} onSave={onSave} />}
      />
    </m.div>
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
      setStatus(errorMessage(error));
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
        <Label className={cn(FIELD_LABEL_CLASS, "flex-1")}>
          <span>{t("admin.usersSearchLabel")}</span>
          <Input
            type="search"
            autoComplete="off"
            spellCheck={false}
            data-admin-users-search
            placeholder={t("admin.usersSearchPlaceholder")}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </Label>
        <Label className={FIELD_LABEL_CLASS}>
          <span>{t("admin.usersCreatedAfterLabel")}</span>
          <Input type="date" data-admin-users-created-after value={createdAfter} onChange={(event) => setCreatedAfter(event.target.value)} />
        </Label>
        <Button variant="secondary" type="button" data-admin-users-sort onClick={() => setSort(sort === "email" ? "created_at" : "email")}>
          {t(sort === "created_at" ? "admin.usersSortByDate" : "admin.usersSortByEmail")}
        </Button>
      </div>
      <div className="-mx-4 max-h-[28rem] overflow-y-auto" data-admin-users-list onScroll={handleScroll}>
        {rows && !rows.length ? (
          <Text className="p-3" tone="muted">
            {t("admin.usersEmpty")}
          </Text>
        ) : null}
        {rows?.map((row) => (
          <UserRow key={row.id} row={row} editable={canEditUser(viewer, row)} onSave={(body) => void handleSave(row.id, body)} />
        ))}
        {rows && rows.length > 0 && users.hasNextPage ? (
          <Text variant="caption" tone="muted" className="block p-2 text-center">
            {t("admin.usersScrollForMore")}
          </Text>
        ) : null}
      </div>
      <Text className="min-h-5" tone="muted" role="status" data-admin-users-status>
        {users.isError ? errorMessage(users.error) : status}
      </Text>
    </div>
  );
}

import { useState } from "react";
import { useT } from "@/lib/i18n";
import { Card, CardContent } from "@/components/ui/card";
import { Segmented } from "@/components/app/Segmented";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { isSuperadminUser, useSessionStore } from "@/stores/session";
import { resolveAdminSubtab, type AdminRail, type AdminSubtab } from "./admin-logic";
import { useAdminViewStore } from "./admin-view-store";
import { SuperadminPanel } from "./SuperadminPanel";
import { UsersPanel } from "./UsersPanel";
import { WordsPanel } from "./WordsPanel";

// Card is display:flex, which would override the `hidden` attribute of the inactive rail panels.
const PANEL_CLASS = "[&[hidden]]:hidden";
const SUBTABS: AdminSubtab[] = ["admin", "superadmin"];
const RAILS: AdminRail[] = ["users", "words"];

/**
 * The admin tab (#adminView): the Admin/Superadmin subtabs (Superadmin only
 * for superadmins) and, under Admin, the Users/Words rail. The route gate
 * admits admins only; the server enforces every privilege. As in the legacy
 * app, every subtab or rail click re-enters its panel from a clean state,
 * while the chosen subtab and rail are kept for the session.
 */
export default function AdminPage() {
  const t = useT();
  const superadmin = useSessionStore((state) => isSuperadminUser(state.user));
  const storedSubtab = useAdminViewStore((state) => state.subtab);
  const rail = useAdminViewStore((state) => state.rail);
  const setSubtab = useAdminViewStore((state) => state.setSubtab);
  const setRail = useAdminViewStore((state) => state.setRail);
  const [entry, setEntry] = useState(0);
  const subtab = resolveAdminSubtab(storedSubtab, superadmin);

  function selectSubtab(next: AdminSubtab) {
    setSubtab(resolveAdminSubtab(next, superadmin));
    setEntry((current) => current + 1);
  }

  function selectRail(next: AdminRail) {
    setRail(next);
    setEntry((current) => current + 1);
  }

  return (
    <section id="adminView" className="tab-view">
      <Tabs className="mb-4" value={subtab} activationMode="manual">
        <TabsList aria-label={t("admin.sectionsLabel")}>
          {SUBTABS.filter((value) => value === "admin" || superadmin).map((value) => (
            <TabsTrigger
              key={value}
              id={value === "superadmin" ? "adminSuperadminSubtab" : undefined}
              value={value}
              data-admin-subtab={value}
              onClick={() => selectSubtab(value)}
            >
              {t(value === "admin" ? "admin.subtabAdmin" : "admin.subtabSuperadmin")}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div data-admin-subtab-panel="admin" hidden={subtab !== "admin"}>
        <div className="flex flex-col gap-4">
          <div id="adminMenu">
            <Segmented
              className="w-fit"
              aria-label={t("admin.areasLabel")}
              value={rail}
              onValueChange={selectRail}
              options={RAILS.map((value) => ({
                value,
                label: t(value === "users" ? "admin.railUsers" : "admin.railWords"),
                itemProps: { "data-admin-rail": value }
              }))}
            />
          </div>
          <div className="w-full min-w-0">
            <Card id="adminUsersPanel" className={PANEL_CLASS} data-admin-rail-panel="users" hidden={rail !== "users"}>
              <CardContent>{subtab === "admin" && rail === "users" ? <UsersPanel key={entry} /> : null}</CardContent>
            </Card>
            <Card id="adminWordsPanel" className={PANEL_CLASS} data-admin-rail-panel="words" hidden={rail !== "words"}>
              <CardContent>{subtab === "admin" && rail === "words" ? <WordsPanel key={entry} /> : null}</CardContent>
            </Card>
          </div>
        </div>
      </div>

      <div data-admin-subtab-panel="superadmin" hidden={subtab !== "superadmin"}>
        <Card id="adminSuperadminPanel" className={PANEL_CLASS}>
          <CardContent>{subtab === "superadmin" ? <SuperadminPanel key={entry} /> : null}</CardContent>
        </Card>
      </div>
    </section>
  );
}

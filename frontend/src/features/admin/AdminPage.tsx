import { useState } from "react";
import { useT } from "@/lib/i18n";
import { PageHeader } from "@/components/app/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { isSuperadminUser, useSessionStore } from "@/stores/session";
import { resolveAdminSubtab, type AdminRail } from "./admin-logic";
import { useAdminViewStore } from "./admin-view-store";
import { SuperadminPanel } from "./SuperadminPanel";
import { UsersPanel } from "./UsersPanel";
import { WordsPanel } from "./WordsPanel";

const RAILS: AdminRail[] = ["users", "words"];

/**
 * The admin tab (#adminView): one Tabs bar with Users and Words (the admin
 * areas) and, for superadmins, Superadmin. The route gate admits admins only;
 * the server enforces every privilege. Every tab click re-enters its panel
 * from a clean state, while the chosen subtab and rail are kept for the session.
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

  const active = subtab === "superadmin" ? "superadmin" : rail;

  function selectTab(next: string) {
    if (next === "superadmin") {
      setSubtab(resolveAdminSubtab("superadmin", superadmin));
    } else {
      setSubtab("admin");
      setRail(next as AdminRail);
    }
    setEntry((current) => current + 1);
  }

  return (
    <section id="adminView">
      <PageHeader title={t("tabs.admin")} />
      <Tabs value={active} activationMode="manual">
        <TabsList data-admin-subtab="admin" aria-label={t("admin.sectionsLabel")} className="mb-2">
          {RAILS.map((value) => (
            <TabsTrigger key={value} value={value} data-admin-rail={value} onClick={() => selectTab(value)}>
              {t(value === "users" ? "admin.railUsers" : "admin.railWords")}
            </TabsTrigger>
          ))}
          {superadmin ? (
            <TabsTrigger id="adminSuperadminSubtab" value="superadmin" data-admin-subtab="superadmin" onClick={() => selectTab("superadmin")}>
              {t("admin.subtabSuperadmin")}
            </TabsTrigger>
          ) : null}
        </TabsList>

        <TabsContent value="users" asChild>
          <Card id="adminUsersPanel" data-admin-rail-panel="users">
            <CardContent>
              <UsersPanel key={entry} />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="words" asChild>
          <Card id="adminWordsPanel" data-admin-rail-panel="words">
            <CardContent>
              <WordsPanel key={entry} />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="superadmin" asChild>
          <Card id="adminSuperadminPanel">
            <CardContent>
              <SuperadminPanel key={entry} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </section>
  );
}

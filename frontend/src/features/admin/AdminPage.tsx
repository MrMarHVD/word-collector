import { useState } from "react";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { isSuperadminUser, useSessionStore } from "@/stores/session";
import { resolveAdminSubtab, type AdminRail, type AdminSubtab } from "./admin-logic";
import { useAdminViewStore } from "./admin-view-store";
import { SuperadminPanel } from "./SuperadminPanel";
import { UsersPanel } from "./UsersPanel";
import { WordsPanel } from "./WordsPanel";

const PANEL_CLASS = "admin-panel rounded-lg border border-line bg-panel p-5 shadow-panel";
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
      <div className="local-tabbar admin-subtabs mb-4" role="tablist" aria-label={t("admin.sectionsLabel")}>
        {SUBTABS.map((value) => (
          <button
            key={value}
            id={value === "superadmin" ? "adminSuperadminSubtab" : undefined}
            className={cn("local-tab admin-subtab", subtab === value && "is-active")}
            type="button"
            role="tab"
            data-admin-subtab={value}
            aria-selected={subtab === value}
            hidden={value === "superadmin" && !superadmin}
            onClick={() => selectSubtab(value)}
          >
            {t(value === "admin" ? "admin.subtabAdmin" : "admin.subtabSuperadmin")}
          </button>
        ))}
      </div>

      <div data-admin-subtab-panel="admin" hidden={subtab !== "admin"}>
        <div className="admin-layout flex flex-col gap-4 desktop:flex-row desktop:items-start">
          <nav
            id="adminMenu"
            className="admin-menu flex shrink-0 gap-1 rounded-lg border border-line bg-muted p-1 desktop:w-44 desktop:flex-col"
            aria-label={t("admin.areasLabel")}
          >
            {RAILS.map((value) => (
              <button
                key={value}
                className={cn(
                  "admin-menu-button flex-1 rounded-md px-3 py-2 text-sm font-semibold text-secondary desktop:text-left",
                  rail === value && "is-active"
                )}
                type="button"
                data-admin-rail={value}
                aria-selected={rail === value}
                onClick={() => selectRail(value)}
              >
                {t(value === "users" ? "admin.railUsers" : "admin.railWords")}
              </button>
            ))}
          </nav>
          <div className="admin-content w-full min-w-0">
            <section id="adminUsersPanel" className={PANEL_CLASS} data-admin-rail-panel="users" hidden={rail !== "users"}>
              {subtab === "admin" && rail === "users" ? <UsersPanel key={entry} /> : null}
            </section>
            <section id="adminWordsPanel" className={PANEL_CLASS} data-admin-rail-panel="words" hidden={rail !== "words"}>
              {subtab === "admin" && rail === "words" ? <WordsPanel key={entry} /> : null}
            </section>
          </div>
        </div>
      </div>

      <div data-admin-subtab-panel="superadmin" hidden={subtab !== "superadmin"}>
        <section id="adminSuperadminPanel" className={PANEL_CLASS}>
          {subtab === "superadmin" ? <SuperadminPanel key={entry} /> : null}
        </section>
      </div>
    </section>
  );
}

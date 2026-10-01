import type { RefObject } from "react";
import { Sidebar } from "@/components/app/Sidebar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { MaterialListItem } from "@/lib/api/types";
import { useIsMobileLayout } from "@/lib/hooks/use-media-query";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { MaterialList } from "@/features/materials";
import { useReaderPreferencesStore } from "@/stores/reader-preferences";
import type { ReaderSidebarTab } from "./reader-session";

const TAB_LABEL_KEYS: Record<ReaderSidebarTab, string> = {
  read: "reader.readTab",
  documents: "reader.documentsTab",
  settings: "reader.settingsTab"
};

const SETTING_ROW = "reader-setting-row flex items-start gap-3 rounded-lg border border-line bg-panel p-3 text-sm font-semibold text-label";

/** Text widths (px) offered in the settings; 0 is automatic. A saved width outside this list gets its own entry. */
const TEXT_WIDTH_OPTIONS = [0, 560, 680, 800, 960, 1120];

export interface ReaderSidebarTabListProps {
  tabs: ReaderSidebarTab[];
  /** The highlighted tab of this list. */
  activeTab: ReaderSidebarTab;
  /** Extra classes: the mobile list (all three tabs, above the layout) or the desktop list (in the sidebar). */
  className: string;
  id?: string;
}

/** A row of reader sidebar tabs (`[data-reader-sidebar-tab]`); must sit inside the page's Tabs root. */
export function ReaderSidebarTabList({ tabs, activeTab, className, id }: ReaderSidebarTabListProps) {
  const t = useT();
  return (
    <TabsList
      id={id}
      className={cn(
        "reader-sidebar-tabs w-auto gap-1 rounded-lg border border-line bg-muted p-1 text-secondary group-data-[orientation=horizontal]/tabs:h-auto",
        className
      )}
    >
      {tabs.map((tab) => (
        <TabsTrigger
          key={tab}
          value={tab}
          data-reader-sidebar-tab={tab}
          className={cn(
            "reader-sidebar-tab-button h-auto rounded-md border-0 px-3 py-2 text-sm font-semibold text-secondary data-[state=active]:bg-transparent data-[state=active]:shadow-none dark:data-[state=active]:bg-transparent",
            tab === activeTab && "is-active"
          )}
        >
          {t(TAB_LABEL_KEYS[tab])}
        </TabsTrigger>
      ))}
    </TabsList>
  );
}

export interface ReaderSidebarProps {
  sidebarRef: RefObject<HTMLElement | null>;
  /** Hidden on mobile while the Read tab shows the page. */
  hidden: boolean;
  /** The desktop list's active tab ("documents" or "settings"). */
  desktopTab: ReaderSidebarTab;
  /** Whether the "show word spaces" option applies (a language written without spaces). */
  showWordSpacesOption: boolean;
  selectedMaterialId: number | null;
  onOpenMaterial: (material: MaterialListItem) => void;
  onMaterialDeleted: (materialId: number) => void;
}

/**
 * The reader sidebar (legacy `.reader-sidebar`): collapsible, with
 * the Documents tab (the materials feature's list, contract I8) and the
 * Settings tab (reader preferences, persisted through the preferences store).
 */
export function ReaderSidebar({
  sidebarRef,
  hidden,
  desktopTab,
  showWordSpacesOption,
  selectedMaterialId,
  onOpenMaterial,
  onMaterialDeleted
}: ReaderSidebarProps) {
  const t = useT();
  const isMobile = useIsMobileLayout();
  const panelWidth = useReaderPreferencesStore((state) => state.panelWidth);
  const collapsed = useReaderPreferencesStore((state) => state.sidebarCollapsed);
  const autoMarkKnown = useReaderPreferencesStore((state) => state.autoMarkKnownOnPageTurn);
  const autoMarkLearning = useReaderPreferencesStore((state) => state.autoMarkLearningOnClick);
  const showWordSpaces = useReaderPreferencesStore((state) => state.showWordSpaces);
  const highlightOpacity = useReaderPreferencesStore((state) => state.highlightOpacity);
  const setPreference = useReaderPreferencesStore((state) => state.setPreference);
  const setPreferences = useReaderPreferencesStore((state) => state.setPreferences);
  const widthOptions = TEXT_WIDTH_OPTIONS.includes(panelWidth) ? TEXT_WIDTH_OPTIONS : [...TEXT_WIDTH_OPTIONS, panelWidth].sort((a, b) => a - b);

  return (
    <Sidebar
      ref={sidebarRef}
      collapsed={collapsed}
      onCollapsedChange={(next) => setPreference("sidebarCollapsed", next)}
      toggleLabel={t("reader.toggleSidebar")}
      toggleId="readerSidebarToggle"
      headClassName="reader-sidebar-head mb-3 flex justify-end"
      className="reader-sidebar sticky top-[88px] z-[8] h-[calc(100vh-88px)] overflow-auto rounded-l-lg border border-line bg-panel p-3.5 shadow-panel"
      hidden={hidden}
    >
      <ReaderSidebarTabList tabs={["documents", "settings"]} activeTab={desktopTab} className="desktop-reader-tabs mb-3 grid grid-cols-2" />
      <TabsContent value="documents" forceMount hidden={desktopTab !== "documents"} className="reader-sidebar-tab-panel" data-reader-sidebar-panel="documents">
        <MaterialList selectedMaterialId={selectedMaterialId} onOpenMaterial={onOpenMaterial} onMaterialDeleted={onMaterialDeleted} />
      </TabsContent>
      <TabsContent value="settings" forceMount hidden={desktopTab !== "settings"} className="reader-sidebar-tab-panel" data-reader-sidebar-panel="settings">
        <label className={SETTING_ROW}>
          <input
            id="readerAutoMarkKnown"
            className="reader-checkbox"
            type="checkbox"
            checked={autoMarkKnown}
            onChange={(event) => setPreference("autoMarkKnownOnPageTurn", event.target.checked)}
          />
          <span className="reader-setting-text">{t("reader.autoMarkKnownOnPageTurn")}</span>
        </label>
        <label className={SETTING_ROW}>
          <input
            id="readerAutoMarkLearning"
            className="reader-checkbox"
            type="checkbox"
            checked={autoMarkLearning}
            onChange={(event) => setPreference("autoMarkLearningOnClick", event.target.checked)}
          />
          <span className="reader-setting-text">{t("reader.autoMarkLearningOnClick")}</span>
        </label>
        <label id="readerShowWordSpacesRow" className={SETTING_ROW} hidden={!showWordSpacesOption}>
          <input
            id="readerShowWordSpaces"
            className="reader-checkbox"
            type="checkbox"
            checked={showWordSpaces}
            onChange={(event) => setPreference("showWordSpaces", event.target.checked)}
          />
          <span className="reader-setting-text">{t("reader.showWordSpaces")}</span>
        </label>
        <div className="reader-setting-row grid gap-2 rounded-lg border border-line bg-panel p-3 text-sm font-semibold text-label" hidden={isMobile}>
          <span id="readerTextWidthLabel">{t("reader.textWidth")}</span>
          <Select value={String(panelWidth)} onValueChange={(value) => setPreferences({ panelWidth: Number(value), focusPanelWidth: Number(value) })}>
            <SelectTrigger
              id="readerTextWidth"
              aria-labelledby="readerTextWidthLabel"
              className="min-h-11 w-full rounded-md border-line bg-panel px-3 text-base font-normal text-main outline-none focus:border-brand focus:ring-2 focus:ring-focus data-[size=default]:h-auto"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {widthOptions.map((width) => (
                <SelectItem key={width} value={String(width)}>
                  {width === 0 ? t("reader.textWidthAuto") : `${width} px`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <label className="reader-setting-row grid gap-2 rounded-lg border border-line bg-panel p-3 text-sm font-semibold text-label">
          <span>{t("reader.highlightOpacity")}</span>
          <input
            id="readerHighlightOpacity"
            className="accent-brand"
            type="range"
            min="0.05"
            max="0.45"
            step="0.05"
            value={highlightOpacity}
            onChange={(event) => setPreference("highlightOpacity", Number(event.target.value))}
          />
        </label>
      </TabsContent>
    </Sidebar>
  );
}

import { useEffect, useState, type UIEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { dashboardSummaryQuery } from "@/lib/api";
import { usePersistentState } from "@/lib/hooks/use-persistent-state";
import { useFormatCount, useT } from "@/lib/i18n";
import { useStudyLanguageStore } from "@/stores/study-language";
import { ProgressCard } from "./ProgressCard";
import { DASHBOARD_STATS_TAB_KEY, documentMeta, isNearScrollEnd, parseDashboardStatsTab, type DashboardStatsTab } from "./progress";
import { useDashboardDocuments } from "./use-dashboard-documents";
import "./dashboard.css";

/** Delay (ms) between the last keystroke in the document search and the reload. */
const DOCUMENT_SEARCH_DEBOUNCE_MS = 200;

const METRIC_CARD_CLASS = "rounded-lg border border-line bg-panel p-5 shadow-panel";
const METRIC_VALUE_CLASS = "block text-3xl font-black leading-none";
const METRIC_LABEL_CLASS = "mt-2 block text-sm text-secondary";
const CHART_GRID_CLASS = "chart-grid grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3";

/**
 * Dashboard (#dashboardView) for the selected study language: the overview tab
 * with the vocabulary totals and per-collection progress, and the documents
 * tab with searchable, scroll-paginated per-document progress. The selected
 * tab persists under wordMarkerDashboardStatsTab.
 */
export default function DashboardPage() {
  const t = useT();
  const formatCount = useFormatCount();
  const languageId = useStudyLanguageStore((state) => state.selectedId);
  const [tab, setTab] = usePersistentState<DashboardStatsTab>(DASHBOARD_STATS_TAB_KEY, parseDashboardStatsTab);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  const { data: dashboard } = useQuery({ ...dashboardSummaryQuery(languageId), enabled: languageId !== null });
  const documentsQuery = useDashboardDocuments(languageId, search, tab === "documents");

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setSearch(searchInput.trim()), DOCUMENT_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timeoutId);
  }, [searchInput]);

  const collections = dashboard?.collections ?? [];
  const wantToPracticeWords = dashboard?.wantToPracticeWords ?? 0;
  const documents = documentsQuery.data?.pages.flatMap((page) => page.documents || []) ?? [];

  let documentStatus: string;
  if (!documents.length) {
    documentStatus = t(search ? "dashboard.noDocumentSearchResults" : "dashboard.noDocuments");
  } else if (documentsQuery.hasNextPage) {
    documentStatus = t("dashboard.scrollForMoreDocuments");
  } else {
    documentStatus = t("dashboard.documentCount", { count: formatCount(documents.length) });
  }

  function loadMoreOnScroll(event: UIEvent<HTMLDivElement>) {
    if (isNearScrollEnd(event.currentTarget) && documentsQuery.hasNextPage && !documentsQuery.isFetching) {
      void documentsQuery.fetchNextPage();
    }
  }

  return (
    <section id="dashboardView" className="tab-view">
      <Tabs className="block" value={tab} onValueChange={(value) => setTab(parseDashboardStatsTab(value))}>
        <TabsList className="local-tabbar dashboard-stats-tabs mb-4" aria-label={t("dashboard.statsTabs")}>
          {(["overview", "documents"] as const).map((value) => (
            <TabsTrigger
              key={value}
              value={value}
              className={`local-tab dashboard-stats-tab${tab === value ? " is-active" : ""}`}
              data-dashboard-stats-tab={value}
            >
              {t(value === "overview" ? "dashboard.overviewTab" : "dashboard.documentsTab")}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" id="dashboardOverviewPanel" data-dashboard-stats-panel="overview">
          <section className="metrics mb-4 grid grid-cols-4 gap-3.5 max-md:grid-cols-1" aria-label={t("dashboard.overallProgress")}>
            <article className={METRIC_CARD_CLASS}>
              <span id="totalWords" className={METRIC_VALUE_CLASS}>
                {formatCount(dashboard?.totalWords ?? 0)}
              </span>
              <small className={METRIC_LABEL_CLASS}>{t("dashboard.totalWords")}</small>
            </article>
            <article className={METRIC_CARD_CLASS}>
              <span id="learningTotal" className={METRIC_VALUE_CLASS}>
                {formatCount(dashboard?.learningWords ?? 0)}
              </span>
              <small className={METRIC_LABEL_CLASS}>{t("dashboard.learningWords")}</small>
            </article>
            <article className={METRIC_CARD_CLASS}>
              <span id="unknownTotal" className={METRIC_VALUE_CLASS}>
                {formatCount(dashboard?.unknownWords ?? 0)}
              </span>
              <small className={METRIC_LABEL_CLASS}>{t("dashboard.unknownWords")}</small>
            </article>
            <article className={METRIC_CARD_CLASS}>
              <span id="collectionCount" className={METRIC_VALUE_CLASS}>
                {formatCount(collections.length)}
              </span>
              <small className={METRIC_LABEL_CLASS}>{t("dashboard.collectionCount")}</small>
            </article>
            {/* The want-to-practice metric only appears once the user has marked a word. */}
            <article id="wantToPracticeCard" className={METRIC_CARD_CLASS} hidden={wantToPracticeWords < 1}>
              <span id="wantToPracticeTotal" className={`${METRIC_VALUE_CLASS} text-brand`}>
                {formatCount(wantToPracticeWords)}
              </span>
              <small className={METRIC_LABEL_CLASS}>{t("dashboard.wantToPracticeWords")}</small>
            </article>
          </section>

          <section className="collection-panel rounded-lg border border-line bg-panel p-5 shadow-panel">
            <div className="section-head mb-4 flex min-h-8 items-center justify-between gap-3">
              <h2 className="text-base font-bold">{t("dashboard.collectionProgress")}</h2>
            </div>
            <div id="collectionCharts" className={CHART_GRID_CLASS}>
              {collections.length ? (
                collections.map((collection) => (
                  <ProgressCard
                    key={collection.id}
                    title={collection.name}
                    subtitle={collection.languageName}
                    detailText={t("progress.knownOfTotal", { total: formatCount(collection.totalWords), known: formatCount(collection.knownWords) })}
                    totalWords={collection.totalWords}
                    knownWords={collection.knownWords}
                    learningWords={collection.learningWords}
                    unknownWords={collection.unknownWords}
                  />
                ))
              ) : (
                <p className="empty text-secondary">{t("dashboard.noCollections")}</p>
              )}
            </div>
          </section>
        </TabsContent>

        <TabsContent value="documents" asChild>
          <section
            id="dashboardDocumentsPanel"
            className="dashboard-documents-panel rounded-lg border border-line bg-panel p-5 shadow-panel"
            data-dashboard-stats-panel="documents"
          >
            <div className="section-head mb-4 flex min-h-8 items-end justify-between gap-3 max-md:grid">
              <div>
                <h2 className="text-base font-bold">{t("dashboard.documentProgress")}</h2>
              </div>
              <label className="dashboard-document-search grid w-[min(340px,100%)] gap-1.5 text-sm font-semibold text-label">
                <span>{t("dashboard.documentSearch")}</span>
                <Input
                  id="dashboardDocumentSearch"
                  className="h-auto min-h-11 border-line bg-panel text-main shadow-none focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-focus"
                  type="search"
                  placeholder={t("dashboard.documentSearchPlaceholder")}
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                />
              </label>
            </div>
            <div id="dashboardDocumentsPane" className="dashboard-documents-pane rounded-lg border border-line bg-subtle p-3" onScroll={loadMoreOnScroll}>
              <div id="dashboardDocumentCharts" className={CHART_GRID_CLASS}>
                {documents.map((document) => (
                  <ProgressCard
                    key={document.id}
                    title={document.title}
                    subtitle={documentMeta(document)}
                    detailText={t("progress.readOfTotal", { total: formatCount(document.totalTokens), read: formatCount(document.readTokens) })}
                    totalWords={document.totalWords}
                    knownWords={document.knownWords}
                    learningWords={document.learningWords}
                    unknownWords={document.unknownWords}
                  />
                ))}
              </div>
              <p id="dashboardDocumentStatus" className="dashboard-document-status mt-3 min-h-5 text-sm text-secondary" role="status">
                {documentStatus}
              </p>
            </div>
          </section>
        </TabsContent>
      </Tabs>
    </section>
  );
}

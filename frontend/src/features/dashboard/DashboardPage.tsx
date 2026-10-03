import { useEffect, useState, type UIEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { m } from "motion/react";
import { PageHeader } from "@/components/app/PageHeader";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Text } from "@/components/ui/text";
import { libraryPath } from "@/app/route-paths";
import { dashboardSummaryQuery } from "@/lib/api";
import { usePersistentState } from "@/lib/hooks/use-persistent-state";
import { useFormatCount, useT } from "@/lib/i18n";
import { MOTION_FADE } from "@/lib/motion";
import { useStudyLanguageStore } from "@/stores/study-language";
import { ProgressCard } from "./ProgressCard";
import { DASHBOARD_STATS_TAB_KEY, documentMeta, isNearScrollEnd, parseDashboardStatsTab, type DashboardStatsTab } from "./progress";
import { useDashboardDocuments } from "./use-dashboard-documents";

/** Delay (ms) between the last keystroke in the document search and the reload. */
const DOCUMENT_SEARCH_DEBOUNCE_MS = 200;

const CHART_GRID_CLASS = "grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3";

/** One overview metric card: the value's element id, an optional card id, and the localised label key. */
interface DashboardMetric {
  valueId: string;
  cardId?: string;
  value: number;
  labelKey: string;
  accent?: boolean;
  hidden?: boolean;
}

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

  const metrics: DashboardMetric[] = [
    { valueId: "totalWords", value: dashboard?.totalWords ?? 0, labelKey: "dashboard.totalWords" },
    { valueId: "learningTotal", value: dashboard?.learningWords ?? 0, labelKey: "dashboard.learningWords" },
    { valueId: "unknownTotal", value: dashboard?.unknownWords ?? 0, labelKey: "dashboard.unknownWords" },
    { valueId: "collectionCount", value: collections.length, labelKey: "dashboard.collectionCount" },
    // The want-to-practice metric only appears once the user has marked a word.
    {
      valueId: "wantToPracticeTotal",
      cardId: "wantToPracticeCard",
      value: wantToPracticeWords,
      labelKey: "dashboard.wantToPracticeWords",
      accent: true,
      hidden: wantToPracticeWords < 1
    }
  ];

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
    <section id="dashboardView">
      <PageHeader title={t("tabs.dashboard")} />
      <Tabs className="block" value={tab} onValueChange={(value) => setTab(parseDashboardStatsTab(value))}>
        <TabsList className="mb-4" aria-label={t("dashboard.statsTabs")}>
          {(["overview", "documents"] as const).map((value) => (
            <TabsTrigger key={value} value={value} data-dashboard-stats-tab={value}>
              {t(value === "overview" ? "dashboard.overviewTab" : "dashboard.documentsTab")}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" asChild>
          <m.div id="dashboardOverviewPanel" data-dashboard-stats-panel="overview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={MOTION_FADE}>
            <section className="mb-4 grid grid-cols-4 gap-3.5 mobile:grid-cols-2 max-[420px]:grid-cols-1" aria-label={t("dashboard.overallProgress")}>
              {metrics.map((metric) => (
                <Card key={metric.valueId} id={metric.cardId} hidden={metric.hidden}>
                  <CardContent>
                    <span id={metric.valueId} className={`block text-title leading-none font-semibold${metric.accent ? " text-brand" : ""}`}>
                      {formatCount(metric.value)}
                    </span>
                    <Text variant="caption" tone="muted" className="mt-2 block">
                      {t(metric.labelKey)}
                    </Text>
                  </CardContent>
                </Card>
              ))}
            </section>

            <Card>
              <CardHeader>
                <Text variant="heading" as="h2">
                  {t("dashboard.collectionProgress")}
                </Text>
              </CardHeader>
              <CardContent>
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
                    <Text tone="muted">{t("dashboard.noCollections")}</Text>
                  )}
                </div>
              </CardContent>
            </Card>
          </m.div>
        </TabsContent>

        <TabsContent value="documents" asChild>
          <m.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={MOTION_FADE} id="dashboardDocumentsPanel" data-dashboard-stats-panel="documents">
            <Card className="min-h-90">
              <CardHeader className="flex flex-wrap items-end justify-between gap-3 mobile:grid">
                <Text variant="heading" as="h2">
                  {t("dashboard.documentProgress")}
                </Text>
                <Label className="grid w-[min(340px,100%)] gap-1.5 text-caption font-medium text-label">
                  <span>{t("dashboard.documentSearch")}</span>
                  <Input
                    id="dashboardDocumentSearch"
                    type="search"
                    placeholder={t("dashboard.documentSearchPlaceholder")}
                    value={searchInput}
                    onChange={(event) => setSearchInput(event.target.value)}
                  />
                </Label>
              </CardHeader>
              <CardContent id="dashboardDocumentsPane" className="max-h-[min(62vh,720px)] overflow-auto mobile:max-h-none" onScroll={loadMoreOnScroll}>
                <div id="dashboardDocumentCharts" className={CHART_GRID_CLASS}>
                  {documents.map((document) => (
                    <ProgressCard
                      key={document.id}
                      title={document.title}
                      titleTo={libraryPath({ focus: document.id })}
                      subtitle={documentMeta(document)}
                      detailText={t("progress.readOfTotal", { total: formatCount(document.totalTokens), read: formatCount(document.readTokens) })}
                      totalWords={document.totalWords}
                      knownWords={document.knownWords}
                      learningWords={document.learningWords}
                      unknownWords={document.unknownWords}
                    />
                  ))}
                </div>
                <Text id="dashboardDocumentStatus" variant="caption" tone="muted" className="mt-3 block min-h-5 empty:hidden" role="status">
                  {documentStatus}
                </Text>
              </CardContent>
            </Card>
          </m.div>
        </TabsContent>
      </Tabs>
    </section>
  );
}

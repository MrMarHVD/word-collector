/**
 * Query definitions shared across features. Anything used by only one feature
 * belongs in that feature's own hooks; these exist because several consumers
 * must share one cache entry.
 */

import { queryOptions, type QueryClient } from "@tanstack/react-query";
import * as dashboard from "./dashboard";
import { queryKeys } from "./query-keys";

/** GET /api/dashboard for a study language; shared by the shell's known-word badge, the dashboard and vocab. */
export function dashboardSummaryQuery(languageId: number | null) {
  return queryOptions({
    queryKey: queryKeys.dashboard.summary(languageId),
    queryFn: () => dashboard.get({ languageId })
  });
}

/**
 * React counterpart of the legacy `loadDashboard()` refresh: invalidates the
 * dashboard, word lists and materials so every mounted view refetches after a
 * mutation that changes vocabulary or documents.
 */
export function refreshStudyData(client: QueryClient): Promise<void> {
  return Promise.all([
    client.invalidateQueries({ queryKey: queryKeys.dashboard.all }),
    client.invalidateQueries({ queryKey: queryKeys.words.all }),
    client.invalidateQueries({ queryKey: queryKeys.materials.all })
  ]).then(() => undefined);
}

/** /api/practice endpoints. */

import { request } from "./client";
import type { PracticeSession, PracticeSessionParams } from "./types";

/** GET /api/practice/session: builds a practice session sized by the user's practiceWordsPerSession. */
export function session(params: PracticeSessionParams): Promise<PracticeSession> {
  return request("/api/practice/session", { query: { languageId: params.languageId, mode: params.mode } });
}

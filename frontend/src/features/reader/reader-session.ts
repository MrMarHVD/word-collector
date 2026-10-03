/**
 * Reader state that outlives the page component. The legacy app kept it in
 * its global state, so switching tabs and coming back showed the same page
 * without refetching; this module plays that role.
 */

import type { MaterialReaderParams } from "@/lib/api/types";
import { registerSessionReset } from "@/stores/session";

/** The page on screen: which material and which request loaded it. */
export interface ReaderView {
  materialId: number;
  params: MaterialReaderParams;
}

interface ReaderSessionState {
  /** Study language the remembered view belongs to. */
  languageId: number | null;
  selectedMaterialId: number | null;
  view: ReaderView | null;
}

function initialReaderSession(): ReaderSessionState {
  return { languageId: null, selectedMaterialId: null, view: null };
}

export const readerSession: ReaderSessionState = initialReaderSession();

/** Forgets the remembered reader state, so the next user starts from their own saved material. */
export function resetReaderSession(): void {
  Object.assign(readerSession, initialReaderSession());
}

registerSessionReset(resetReaderSession);

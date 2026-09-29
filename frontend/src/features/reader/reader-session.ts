/**
 * Reader state that outlives the page component. The legacy app kept it in
 * its global state, so switching tabs and coming back showed the same page,
 * sidebar tab and panel size without refetching; this module plays that role.
 */

import type { MaterialReaderParams } from "@/lib/api/types";
import { registerSessionReset } from "@/stores/session";

export type ReaderSidebarTab = "read" | "documents" | "settings";

/** The page on screen: which material and which request loaded it. */
export interface ReaderView {
  materialId: number;
  params: MaterialReaderParams;
}

/** Last resolved panel size, reused as the saved size on the next layout (legacy state.readerPanel*). */
export interface ResolvedPanelSize {
  width: number;
  height: number;
  focusWidth: number;
}

interface ReaderSessionState {
  /** Study language the remembered view belongs to. */
  languageId: number | null;
  selectedMaterialId: number | null;
  view: ReaderView | null;
  sidebarTab: ReaderSidebarTab;
  panel: ResolvedPanelSize | null;
}

function initialReaderSession(): ReaderSessionState {
  return { languageId: null, selectedMaterialId: null, view: null, sidebarTab: "read", panel: null };
}

export const readerSession: ReaderSessionState = initialReaderSession();

/** Forgets the remembered reader state, so the next user starts from their own saved material. */
export function resetReaderSession(): void {
  Object.assign(readerSession, initialReaderSession());
}

registerSessionReset(resetReaderSession);

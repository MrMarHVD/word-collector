/**
 * Pure geometry of the radial quick menu (ported from reader.controller.js):
 * the four actions around the pressed word, where the menu opens, and which
 * action the pointer is pointing at.
 */

import type { WordStatus } from "@/lib/api/types";

/** Hold time before the quick menu (or a touch segment selection) starts. */
export const READER_HOLD_DELAY_MS = 360;
/** Movement that cancels a hold, or starts a mouse segment selection. */
export const READER_HOLD_CANCEL_DISTANCE = 12;
/** Distance from the centre inside which no action is selected. */
export const READER_MENU_SELECTION_DISTANCE = 54;
export const READER_MENU_RADIUS = 82;
export const READER_MENU_MARGIN = 14;

export type QuickMenuActionKey = "unknown" | "learning" | "known" | "practice";

export interface QuickMenuAction {
  key: QuickMenuActionKey;
  /** The status set by a status action; undefined for the practice toggle. */
  status?: WordStatus;
  /** Unit direction from the centre. */
  x: number;
  y: number;
}

/** Unknown above, learning left, known right, practice below. */
export const QUICK_MENU_ACTIONS: QuickMenuAction[] = [
  { key: "unknown", status: "unknown", x: 0, y: -1 },
  { key: "learning", status: "learning", x: -1, y: 0 },
  { key: "known", status: "known", x: 1, y: 0 },
  { key: "practice", x: 0, y: 1 }
];

export interface Point {
  x: number;
  y: number;
}

/** The menu centre: the press point, kept far enough from the viewport edges for every option to show. */
export function quickMenuOrigin(press: Point, viewport: { width: number; height: number }): Point {
  const edge = READER_MENU_RADIUS + READER_MENU_MARGIN;
  return {
    x: Math.min(Math.max(press.x, edge), viewport.width - edge),
    y: Math.min(Math.max(press.y, edge), viewport.height - edge)
  };
}

/** The action nearest the pointer, or null while the pointer is still near the centre. */
export function closestQuickMenuAction(origin: Point, pointer: Point, actions: QuickMenuAction[] = QUICK_MENU_ACTIONS): QuickMenuAction | null {
  const dx = pointer.x - origin.x;
  const dy = pointer.y - origin.y;
  if (Math.hypot(dx, dy) < READER_MENU_SELECTION_DISTANCE) {
    return null;
  }
  let closest: { action: QuickMenuAction; distance: number } | null = null;
  for (const action of actions) {
    const distance = Math.hypot(dx - action.x * READER_MENU_RADIUS, dy - action.y * READER_MENU_RADIUS);
    if (!closest || distance < closest.distance) {
      closest = { action, distance };
    }
  }
  return closest?.action ?? null;
}

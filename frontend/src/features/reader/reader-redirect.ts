/** Pure choice of where /reader (without a work) goes. */

import type { MaterialListItem } from "@/lib/api/types";

/**
 * The work /reader reopens: the most recently opened one (lastOpenedAt, ISO),
 * else the work remembered in localStorage, else null (go to the Library).
 * A missing lastOpenedAt counts as never opened.
 */
export function pickLastOpenedMaterialId(materials: Pick<MaterialListItem, "id" | "lastOpenedAt">[], cachedId: number | null): number | null {
  let best: Pick<MaterialListItem, "id" | "lastOpenedAt"> | null = null;
  for (const material of materials) {
    if (material.lastOpenedAt && (!best || material.lastOpenedAt > (best.lastOpenedAt as string))) {
      best = material;
    }
  }
  return best?.id ?? cachedId;
}

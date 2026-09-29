import type { MaterialListItem } from "@/lib/api/types";

export interface MaterialListProps {
  /** Material currently open in the reader (highlighted), or null. */
  selectedMaterialId: number | null;
  /**
   * Open a material in the reader: called when the user picks a ready
   * material, and when a material imported from this list finishes importing
   * and translating (the legacy auto-open).
   */
  onOpenMaterial: (material: MaterialListItem) => void;
  /** Called after a material is deleted, so the reader can close it if it was open. */
  onMaterialDeleted?: (materialId: number) => void;
}

/**
 * The reader's documents-tab body: import button (#materialImportOpen,
 * opening MaterialImportDialog), search (#materialSearch) and the paginated
 * list (#materialList) with rename, delete and import/translation progress.
 * Stub: renders nothing until RX-006 implements it.
 */
export function MaterialList(props: MaterialListProps) {
  void props;
  return null;
}

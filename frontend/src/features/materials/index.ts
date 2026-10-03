/**
 * Public surface of the materials feature for other features (contract I8).
 * Consumers (the reader's documents tab, the Library) import only from here.
 */
export { MaterialList, type MaterialListProps } from "./MaterialList";
export { MaterialImportDialog, type MaterialImportDialogProps } from "./MaterialImportDialog";
export {
  hasPendingWork,
  importProgress,
  MATERIAL_LOAD_MORE_THRESHOLD_PX,
  MATERIAL_POLL_INTERVAL_MS,
  MATERIAL_SEARCH_DEBOUNCE_MS,
  materialRowState
} from "./materials";
export { flattenMaterials, useDeleteMaterial, useRenameMaterial } from "./use-materials";

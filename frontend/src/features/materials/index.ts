/**
 * Public surface of the materials feature for other features (contract I8).
 * Consumers (the reader's documents tab, the Library) import only from here.
 */
export { MaterialList, type MaterialListProps } from "./MaterialList";
export { MaterialImportDialog, type MaterialImportDialogProps } from "./MaterialImportDialog";
export { hasPendingWork, MATERIAL_POLL_INTERVAL_MS } from "./materials";
export { flattenMaterials } from "./use-materials";

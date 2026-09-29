import type { MaterialDetail } from "@/lib/api/types";

export interface MaterialImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called once the upload is accepted and the background import has started. */
  onImportStarted?: (material: MaterialDetail) => void;
}

/**
 * The material import dialog (#materialImportModal): TXT/EPUB/PDF upload with
 * beta-limit errors and import progress. MaterialList renders it itself; it is
 * exported for other entry points. Stub: renders nothing until RX-006 implements it.
 */
export function MaterialImportDialog(props: MaterialImportDialogProps) {
  void props;
  return null;
}

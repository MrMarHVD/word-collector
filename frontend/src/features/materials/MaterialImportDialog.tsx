import { useRef, useState, type FormEvent } from "react";
import { CloseButton } from "@/components/app/CloseButton";
import { toastError } from "@/components/app/toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/lib/api";
import type { MaterialDetail } from "@/lib/api/types";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { importProgress, validateImportFile } from "./materials";
import { useMaterialsList, useUploadMaterial } from "./use-materials";
import "./materials.css";

export interface MaterialImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called once the upload is accepted and the background import has started. */
  onImportStarted?: (material: MaterialDetail) => void;
}

/**
 * The material import dialog (#materialImportModal): TXT/EPUB/PDF upload with
 * beta-limit errors and import progress. The Library renders it. As in the legacy app it closes as soon as
 * the upload starts; its status line and progress bar keep tracking the last
 * import and show again when it is reopened, as does a file chosen but not
 * yet imported.
 */
export function MaterialImportDialog({ open, onOpenChange, onImportStarted }: MaterialImportDialogProps) {
  const t = useT();
  const fileInput = useRef<HTMLInputElement>(null);
  // The dialog content unmounts on close; the chosen file is kept here and restored on reopen.
  const chosenFile = useRef<File | null>(null);
  const [status, setStatus] = useState("");
  const [trackedId, setTrackedId] = useState<number | null>(null);
  const upload = useUploadMaterial();
  const { materials } = useMaterialsList("");

  const tracked = trackedId === null ? null : materials.find((material) => material.id === trackedId);
  const importing = tracked?.importStatus === "processing";
  const failed = tracked?.importStatus === "failed";
  const progressActive = upload.isPending || importing || failed;
  const progress = importing ? importProgress(tracked) : { percent: 100, determinate: false };
  let progressLabel = t("reader.preparing");
  if (failed) {
    progressLabel = tracked.importError || t("reader.importFailed");
  } else if (importing && progress.determinate) {
    progressLabel = t("reader.translationProgress", { percent: String(progress.percent) });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = fileInput.current?.files?.[0] ?? null;
    const invalid = validateImportFile(file, materials.length);
    if (invalid || !file) {
      setStatus(invalid ? t(invalid.key, "values" in invalid ? invalid.values : undefined) : "");
      return;
    }
    setStatus(t("reader.importing"));
    setTrackedId(null);
    onOpenChange(false);
    try {
      const { material } = await upload.mutateAsync(file);
      setStatus(t("reader.importStarted"));
      chosenFile.current = null;
      setTrackedId(material.id);
      onImportStarted?.(material);
    } catch (error) {
      setStatus(errorMessage(error));
      toastError(error);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        id="materialImportModal"
        showCloseButton={false}
        aria-describedby={undefined}
        className="material-import-panel block rounded-lg border-line bg-panel p-5 shadow-panel sm:max-w-md"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          restoreChosenFile(fileInput.current, chosenFile.current);
          fileInput.current?.focus();
        }}
      >
        <form id="materialImportForm" onSubmit={submit}>
          <div className="section-head mb-4 flex min-h-8 items-center justify-between gap-3">
            <DialogTitle id="materialImportModalTitle" className="text-base font-bold leading-normal">
              {t("reader.import")}
            </DialogTitle>
            <CloseButton id="materialImportModalClose" label={t("reader.closeImport")} onClick={() => onOpenChange(false)} />
          </div>
          <label className="grid gap-1.5 text-sm font-semibold text-label">
            <span>{t("reader.file")}</span>
            <Input
              ref={fileInput}
              onChange={(event) => {
                chosenFile.current = event.currentTarget.files?.[0] ?? null;
              }}
              id="materialFile"
              className="h-auto min-h-11 border-line bg-panel px-3 py-2 text-sm text-main file:mr-3 file:h-auto file:rounded-md file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-label md:text-sm"
              type="file"
              accept=".pdf,.epub,.txt,application/pdf,application/epub+zip,text/plain"
            />
          </label>
          <Button className="mt-3 min-h-11 w-full px-4 text-white" type="submit" disabled={upload.isPending}>
            {t("reader.importButton")}
          </Button>
          {progressActive ? (
            <div
              id="materialImportProgress"
              className="mt-3"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={importing && progress.determinate ? progress.percent : undefined}
            >
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  id="materialImportProgressBar"
                  className={cn("h-full rounded-full bg-brand transition-all duration-500", !progress.determinate && !failed && "animate-pulse")}
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
              <p id="materialImportProgressLabel" className="mt-1 text-xs text-secondary">
                {progressLabel}
              </p>
            </div>
          ) : null}
          <p id="materialImportStatus" className="status mt-3 min-h-5 text-sm text-secondary" role="status">
            {status}
          </p>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Puts a previously chosen file back into a freshly mounted file input. */
function restoreChosenFile(input: HTMLInputElement | null, file: File | null) {
  if (!input || !file || input.files?.length) {
    return;
  }
  const transfer = new DataTransfer();
  transfer.items.add(file);
  input.files = transfer.files;
}

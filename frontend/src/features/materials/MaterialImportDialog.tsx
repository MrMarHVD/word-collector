import { useRef, useState, type FormEvent } from "react";
import { CloseButton } from "@/components/app/CloseButton";
import { toastError } from "@/components/app/toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Text } from "@/components/ui/text";
import { errorMessage } from "@/lib/api";
import type { MaterialDetail } from "@/lib/api/types";
import { useT } from "@/lib/i18n";
import { importProgress, validateImportFile } from "./materials";
import { useMaterialsList, useUploadMaterial } from "./use-materials";

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
        className="block sm:max-w-md mobile:max-h-[calc(100dvh-24px)] mobile:overflow-auto mobile:p-4"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          restoreChosenFile(fileInput.current, chosenFile.current);
          fileInput.current?.focus();
        }}
      >
        <form id="materialImportForm" onSubmit={submit}>
          <div className="mb-4 flex min-h-8 items-center justify-between gap-3">
            <DialogTitle id="materialImportModalTitle" className="text-heading">
              {t("reader.import")}
            </DialogTitle>
            <CloseButton id="materialImportModalClose" label={t("reader.closeImport")} onClick={() => onOpenChange(false)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="materialFile" className="text-label">
              {t("reader.file")}
            </Label>
            <Input
              ref={fileInput}
              onChange={(event) => {
                chosenFile.current = event.currentTarget.files?.[0] ?? null;
              }}
              id="materialFile"
              type="file"
              accept=".pdf,.epub,.txt,application/pdf,application/epub+zip,text/plain"
            />
          </div>
          <Button className="mt-3 w-full mobile:h-11" type="submit" disabled={upload.isPending}>
            {t("reader.importButton")}
          </Button>
          {progressActive ? (
            <div id="materialImportProgress" className="mt-3">
              <Progress
                value={progress.percent}
                indeterminate={importing && !progress.determinate}
                aria-label={progressLabel}
                indicatorProps={{ id: "materialImportProgressBar" }}
              />
              <Text id="materialImportProgressLabel" variant="caption" tone="muted" className="mt-1 block">
                {progressLabel}
              </Text>
            </div>
          ) : null}
          <Text id="materialImportStatus" variant="caption" tone="muted" className="mt-3 block min-h-5" role="status">
            {status}
          </Text>
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

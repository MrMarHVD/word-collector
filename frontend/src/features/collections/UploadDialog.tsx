import { useRef, useState, type FormEvent } from "react";
import { CloseButton } from "@/components/app/CloseButton";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/lib/api";
import type { CollectionStats, ImportWordsRequest, ImportWordsResponse } from "@/lib/api/types";
import { useFormatCount, useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { parseCsv } from "./csv";

type UploadTarget = "new" | "existing";

export interface UploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Study language the words are imported into. */
  languageId: number | null;
  /** The study language's collections, offered as existing targets. */
  collections: CollectionStats[];
  /** Called after a successful import, before the dialog closes; awaited. */
  onImported: (result: ImportWordsResponse) => Promise<void>;
}

const FIELD_CLASS = "min-h-11 rounded-md border border-line bg-panel px-3 text-main outline-none focus:border-brand focus:ring-2 focus:ring-focus";

/**
 * CSV word-list upload dialog (#uploadModal, ported from the imports
 * controller): imports the parsed file into a new or an existing collection
 * of the study language. The target choice is kept between openings, falling
 * back to "new" while there are no collections.
 */
export function UploadDialog({ open, onOpenChange, languageId, collections, onImported }: UploadDialogProps) {
  const t = useT();
  const formatCount = useFormatCount();
  const [target, setTarget] = useState<UploadTarget>("new");
  const [status, setStatus] = useState("");
  const [pending, setPending] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  const hasExisting = collections.length > 0;
  const activeTarget: UploadTarget = hasExisting ? target : "new";

  function changeOpen(next: boolean) {
    if (!next) {
      setStatus("");
    }
    onOpenChange(next);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get("csvFile");
    setPending(true);
    setStatus(t("upload.inProgress"));
    try {
      const payload: ImportWordsRequest = {
        languageId: Number(languageId),
        words: parseCsv(file instanceof File ? await file.text() : "")
      };
      if (activeTarget === "existing") {
        const id = Number(data.get("collectionId"));
        if (!id) {
          setStatus(t("upload.selectCollection"));
          return;
        }
        payload.collectionId = id;
      } else {
        payload.collectionName = String(data.get("collectionName") ?? "");
      }
      const result = await api.imports.importWords(payload);
      setStatus(t("upload.result", { inserted: formatCount(result.inserted), skipped: formatCount(result.skipped) }));
      form.reset();
      await onImported(result);
      changeOpen(false);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("errors.requestFailed"));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent
        id="uploadModal"
        className="upload-modal upload-panel block w-full max-w-md gap-0 rounded-lg border-line bg-panel p-5 shadow-panel sm:max-w-md"
        showCloseButton={false}
        aria-describedby={undefined}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          (activeTarget === "existing" ? selectRef.current : nameRef.current)?.focus();
        }}
      >
        <form id="uploadForm" onSubmit={(event) => void handleSubmit(event)}>
          <div className="section-head mb-4 flex min-h-8 items-center justify-between gap-3">
            <DialogTitle id="uploadModalTitle" className="text-base leading-normal font-bold">
              {t("upload.title")}
            </DialogTitle>
            <CloseButton id="uploadModalClose" label={t("upload.close")} onClick={() => changeOpen(false)} />
          </div>
          <div
            className="upload-target-tabs mb-3 grid grid-cols-2 gap-1 rounded-lg border border-line bg-muted p-1"
            role="group"
            aria-label={t("collections.uploadTarget")}
          >
            {(["new", "existing"] as const).map((value) => (
              <button
                key={value}
                id={value === "new" ? "uploadTargetNewButton" : "uploadTargetExistingButton"}
                className={cn("upload-target-button rounded-md px-3 py-2 text-sm font-semibold text-secondary", activeTarget === value && "is-active")}
                type="button"
                data-upload-target={value}
                aria-pressed={activeTarget === value}
                disabled={value === "existing" && !hasExisting}
                onClick={() => setTarget(value)}
              >
                {t(value === "new" ? "upload.targetNew" : "upload.targetExisting")}
              </button>
            ))}
          </div>
          <label id="uploadNewCollectionField" className="grid gap-1.5 text-sm font-semibold text-label" hidden={activeTarget === "existing"}>
            <span>{t("upload.collection")}</span>
            <input
              ref={nameRef}
              id="collectionName"
              className={FIELD_CLASS}
              name="collectionName"
              type="text"
              placeholder={t("upload.collectionPlaceholder")}
              required={activeTarget === "new"}
            />
          </label>
          <label id="uploadExistingCollectionField" className="grid gap-1.5 text-sm font-semibold text-label" hidden={activeTarget !== "existing"}>
            <span>{t("upload.existingCollection")}</span>
            <select ref={selectRef} id="uploadCollectionSelect" className={FIELD_CLASS} name="collectionId" required={activeTarget === "existing"}>
              {hasExisting ? (
                collections.map((collection) => (
                  <option key={collection.id} value={collection.id}>
                    {collection.name}
                  </option>
                ))
              ) : (
                <option value="">{t("collections.noCollections")}</option>
              )}
            </select>
          </label>
          <label className="mt-3 grid gap-1.5 text-sm font-semibold text-label">
            <span>{t("upload.file")}</span>
            <input
              id="csvFile"
              className="min-h-11 rounded-md border border-line bg-panel px-3 py-2 text-sm text-main file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-label"
              name="csvFile"
              type="file"
              accept=".csv,text/csv,text/plain"
              required
            />
          </label>
          <p className="hint mt-3 min-h-5 text-sm text-secondary">{t("upload.format")}</p>
          <button className="mt-2 min-h-11 w-full rounded-md bg-brand px-4 text-sm font-bold text-white hover:bg-brand-strong" type="submit" disabled={pending}>
            {t("upload.button")}
          </button>
          <p id="uploadStatus" className="status mt-3 min-h-5 text-sm text-secondary" role="status">
            {status}
          </p>
        </form>
      </DialogContent>
    </Dialog>
  );
}

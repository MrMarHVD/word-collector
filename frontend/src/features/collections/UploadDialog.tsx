import { useRef, useState, type FormEvent } from "react";
import { CloseButton } from "@/components/app/CloseButton";
import { Segmented } from "@/components/app/Segmented";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Text } from "@/components/ui/text";
import { api, errorMessage } from "@/lib/api";
import type { CollectionStats, ImportWordsRequest, ImportWordsResponse } from "@/lib/api/types";
import { useFormatCount, useT } from "@/lib/i18n";
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
      setStatus(errorMessage(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent
        id="uploadModal"
        className="upload-modal gap-0 sm:max-w-md"
        showCloseButton={false}
        aria-describedby={undefined}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          (activeTarget === "existing" ? selectRef.current : nameRef.current)?.focus();
        }}
      >
        <form id="uploadForm" onSubmit={(event) => void handleSubmit(event)}>
          <div className="section-head mb-4 flex min-h-8 items-center justify-between gap-3">
            <DialogTitle id="uploadModalTitle">{t("upload.title")}</DialogTitle>
            <CloseButton id="uploadModalClose" label={t("upload.close")} onClick={() => changeOpen(false)} />
          </div>
          <Segmented
            className="upload-target-tabs mb-3"
            aria-label={t("collections.uploadTarget")}
            value={activeTarget}
            onValueChange={setTarget}
            options={(["new", "existing"] as const).map((value) => ({
              value,
              label: t(value === "new" ? "upload.targetNew" : "upload.targetExisting"),
              itemProps: {
                id: value === "new" ? "uploadTargetNewButton" : "uploadTargetExistingButton",
                "data-upload-target": value,
                disabled: value === "existing" && !hasExisting
              }
            }))}
          />
          <div id="uploadNewCollectionField" className="grid gap-1.5" hidden={activeTarget === "existing"}>
            <Label htmlFor="collectionName">{t("upload.collection")}</Label>
            <Input
              ref={nameRef}
              id="collectionName"
              name="collectionName"
              type="text"
              placeholder={t("upload.collectionPlaceholder")}
              required={activeTarget === "new"}
            />
          </div>
          <div id="uploadExistingCollectionField" className="grid gap-1.5" hidden={activeTarget !== "existing"}>
            <Label htmlFor="uploadCollectionSelect">{t("upload.existingCollection")}</Label>
            <NativeSelect ref={selectRef} id="uploadCollectionSelect" name="collectionId" required={activeTarget === "existing"}>
              {hasExisting ? (
                collections.map((collection) => (
                  <option key={collection.id} value={collection.id}>
                    {collection.name}
                  </option>
                ))
              ) : (
                <option value="">{t("collections.noCollections")}</option>
              )}
            </NativeSelect>
          </div>
          <div className="mt-3 grid gap-1.5">
            <Label htmlFor="csvFile">{t("upload.file")}</Label>
            <Input id="csvFile" className="h-auto py-1.5" name="csvFile" type="file" accept=".csv,text/csv,text/plain" required />
          </div>
          <Text variant="caption" tone="muted" className="hint mt-3 block min-h-5">
            {t("upload.format")}
          </Text>
          <Button className="mt-2 w-full" size="lg" type="submit" disabled={pending}>
            {t("upload.button")}
          </Button>
          <Text as="p" variant="caption" tone="muted" id="uploadStatus" className="status mt-3 min-h-5" role="status">
            {status}
          </Text>
        </form>
      </DialogContent>
    </Dialog>
  );
}

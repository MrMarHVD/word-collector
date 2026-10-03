import { useState, type FormEvent } from "react";
import { PencilIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { hasTranslationOverride, type TranslationEntry } from "@/lib/disambiguation";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export interface TranslationOverrideProps {
  /** Reader token or vocab word; `translation` is what is displayed. */
  entry: TranslationEntry;
  /** Word id, rendered as data-word-id on the controls. */
  wordId: number;
  /** "vocab" (word table) or "reader" (word-info popup); rendered as data-translation-context. */
  context: "vocab" | "reader";
  /** Narrow full-width layout used in the reader popup. */
  compact?: boolean;
  /** Controlled edit state; only one entry should edit at a time. */
  editing: boolean;
  /** Edit button pressed: set `editing` to true. */
  onEdit: () => void;
  /** Cancel pressed: set `editing` to false. */
  onCancel: () => void;
  /** Form submitted with the raw input value; send it as translationOverride, then leave edit mode. */
  onSave: (value: string) => void | Promise<void>;
  /** Clear pressed (only shown while an override exists); send translationOverride: null. */
  onClear: () => void | Promise<void>;
}

/**
 * Inline display/edit control for a word's translation override (ported from
 * public/js/views/components/translation-override.js). Shows the translation
 * (bold when overridden) with edit/clear buttons, or an inline form while editing.
 */
export function TranslationOverride({ entry, wordId, context, compact = false, editing, onEdit, onCancel, onSave, onClear }: TranslationOverrideProps) {
  const t = useT();
  const [pending, setPending] = useState(false);
  const overridden = hasTranslationOverride(entry);

  async function run(action: () => void | Promise<void>) {
    setPending(true);
    try {
      await action();
    } finally {
      setPending(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = String(new FormData(event.currentTarget).get("translationOverride") ?? "");
    void run(() => onSave(value));
  }

  if (editing) {
    return (
      <form
        className={cn("flex w-full items-center gap-1.5", !compact && "max-w-[360px]")}
        data-translation-override-form
        data-word-id={wordId}
        onSubmit={handleSubmit}
      >
        <Input
          className="min-w-0 flex-1"
          name="translationOverride"
          defaultValue={overridden ? entry.translationOverride || "" : entry.translation || ""}
          placeholder={t("translation.overridePlaceholder")}
          aria-label={t("translation.overrideInput")}
          autoComplete="off"
          autoFocus
        />
        <Button size="sm" type="submit" disabled={pending}>
          {t("translation.save")}
        </Button>
        <IconButton
          size="sm"
          data-translation-override-cancel
          data-word-id={wordId}
          aria-label={t("translation.cancel")}
          title={t("translation.cancel")}
          onClick={onCancel}
        >
          <XIcon />
        </IconButton>
      </form>
    );
  }

  return (
    <div className={cn("inline-flex max-w-full items-center gap-2", compact && "w-full justify-between")}>
      <Text as="span" tone={overridden ? "main" : "label"} className={cn("min-w-0 break-words", overridden && "font-semibold")} data-translation-override-text>
        {entry.translation || t("reader.noTranslation")}
      </Text>
      <span className="inline-flex flex-none gap-1">
        <IconButton
          size="sm"
          data-translation-override-edit
          data-word-id={wordId}
          data-translation-context={context}
          aria-label={t("translation.edit")}
          title={t("translation.edit")}
          onClick={onEdit}
        >
          <PencilIcon />
        </IconButton>
        {overridden ? (
          <IconButton
            size="sm"
            variant="destructive"
            data-translation-override-clear
            data-word-id={wordId}
            aria-label={t("translation.clearOverride")}
            title={t("translation.clearOverride")}
            disabled={pending}
            onClick={() => void run(onClear)}
          >
            <XIcon />
          </IconButton>
        ) : null}
      </span>
    </div>
  );
}

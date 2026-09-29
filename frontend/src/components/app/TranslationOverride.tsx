import { useState, type FormEvent } from "react";
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

function EditIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="material-action-icon">
      <path d="M4 20h4l11-11a2.8 2.8 0 0 0-4-4L4 16v4Z" />
      <path d="M13.5 6.5l4 4" />
    </svg>
  );
}

function ClearIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="material-action-icon">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
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
      <form className={cn("translation-override-form", compact && "is-compact")} data-translation-override-form data-word-id={wordId} onSubmit={handleSubmit}>
        <input
          className="translation-override-input"
          name="translationOverride"
          defaultValue={overridden ? entry.translationOverride || "" : entry.translation || ""}
          placeholder={t("translation.overridePlaceholder")}
          aria-label={t("translation.overrideInput")}
          autoComplete="off"
          autoFocus
        />
        <button className="secondary-button translation-override-save" type="submit" disabled={pending}>
          {t("translation.save")}
        </button>
        <button
          className="material-icon-button material-delete-button translation-override-cancel"
          type="button"
          data-translation-override-cancel
          data-word-id={wordId}
          aria-label={t("translation.cancel")}
          title={t("translation.cancel")}
          onClick={onCancel}
        >
          <ClearIcon />
        </button>
      </form>
    );
  }

  return (
    <div className={cn("translation-override-display", compact && "is-compact")}>
      <span className={cn("translation-override-text", overridden && "is-overridden")}>{entry.translation || t("reader.noTranslation")}</span>
      <span className="translation-override-actions">
        <button
          className="material-icon-button material-rename-button translation-override-edit"
          type="button"
          data-translation-override-edit
          data-word-id={wordId}
          data-translation-context={context}
          aria-label={t("translation.edit")}
          title={t("translation.edit")}
          onClick={onEdit}
        >
          <EditIcon />
        </button>
        {overridden ? (
          <button
            className="material-icon-button material-delete-button translation-override-clear"
            type="button"
            data-translation-override-clear
            data-word-id={wordId}
            aria-label={t("translation.clearOverride")}
            title={t("translation.clearOverride")}
            disabled={pending}
            onClick={() => void run(onClear)}
          >
            <ClearIcon />
          </button>
        ) : null}
      </span>
    </div>
  );
}

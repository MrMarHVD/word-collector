import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Input } from "@/components/ui/input";
import type { AdminWord, Language } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { defaultNativeLanguage } from "./admin-logic";
import { useDebouncedValue } from "./use-debounced-value";
import { ADMIN_WORDS_PAGE_SIZE, useAdminWordLanguages, useAdminWords, useSaveCanonicalTranslation } from "./queries";

const SEARCH_DEBOUNCE_MS = 250;
const FIELD_INPUT_CLASS = "min-h-11 rounded-md border border-line bg-panel px-3 text-main outline-none focus:border-brand focus:ring-2 focus:ring-focus";

/** A muted one-line message inside the panel or list (loading, empty and error states). */
function WordsMessage({ text }: { text: string }) {
  return <p className="admin-words-message px-3 py-4 text-sm text-secondary">{text}</p>;
}

/**
 * One word with its inline canonical-translation cell. Saves on blur (Enter
 * blurs) when the trimmed value changed; reverts on failure and reports it
 * through `onError`.
 */
function WordRow({
  word,
  onSave,
  onError
}: {
  word: AdminWord;
  onSave: (wordId: number, translation: string) => Promise<string>;
  onError: (message: string) => void;
}) {
  const t = useT();
  const [original, setOriginal] = useState(word.canonicalTranslation || "");
  const [value, setValue] = useState(original);
  const [saving, setSaving] = useState(false);
  const [shownTranslation, setShownTranslation] = useState(word.canonicalTranslation);
  if (shownTranslation !== word.canonicalTranslation) {
    setShownTranslation(word.canonicalTranslation);
    setOriginal(word.canonicalTranslation || "");
    setValue(word.canonicalTranslation || "");
  }

  async function handleBlur() {
    const next = value.trim();
    if (next === original) {
      return;
    }
    setSaving(true);
    try {
      const saved = await onSave(word.id, next);
      setValue(saved);
      setOriginal(saved);
    } catch (error) {
      setValue(original);
      onError((error instanceof Error && error.message) || t("admin.words.saveError"));
    } finally {
      setSaving(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.currentTarget.blur();
    }
  }

  return (
    <div className="admin-words-row flex items-center gap-3 border-b border-line px-3 py-2 last:border-b-0" data-word-id={word.id}>
      <div className="admin-words-term min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-main">{word.word}</div>
        {word.lemma && word.lemma !== word.word ? <div className="truncate text-xs text-secondary">{word.lemma}</div> : null}
      </div>
      <Input
        className="admin-words-translation h-auto min-h-9 flex-1 bg-panel px-2 text-sm text-main"
        type="text"
        value={value}
        placeholder={t("admin.words.translationPlaceholder")}
        disabled={saving}
        onChange={(event) => setValue(event.target.value)}
        onBlur={() => void handleBlur()}
        onKeyDown={handleKeyDown}
      />
    </div>
  );
}

/**
 * The scrolling word list for one language/translation-language/search
 * selection, loading further pages when its end sentinel scrolls into view.
 * Mounted per selection, so a change starts again from the first page.
 */
function WordsList({ languageId, nativeLanguage, search }: { languageId: number; nativeLanguage: string; search: string }) {
  const t = useT();
  const filters = { languageId, native: nativeLanguage, search: search || undefined, limit: ADMIN_WORDS_PAGE_SIZE };
  const words = useAdminWords(filters);
  const saveTranslation = useSaveCanonicalTranslation(filters);
  const [saveErrors, setSaveErrors] = useState<string[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const rows = words.data?.pages.flatMap((page) => page.words) ?? [];
  const { hasNextPage, isFetchingNextPage, isError, fetchNextPage } = words;
  const canLoadMore = hasNextPage && !isError;

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!canLoadMore || !sentinel) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting) && !isFetchingNextPage) {
          void fetchNextPage();
        }
      },
      { root: listRef.current, rootMargin: "120px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [canLoadMore, isFetchingNextPage, fetchNextPage, rows.length]);

  const loadError = words.error ? words.error.message || t("admin.words.loadError") : "";

  return (
    <div ref={listRef} className="admin-words-list max-h-[28rem] overflow-y-auto rounded-md border border-line">
      {words.isPending ? <WordsMessage text={t("admin.words.loading")} /> : null}
      {!words.isPending && !rows.length && !loadError ? <WordsMessage text={t("admin.words.noWords")} /> : null}
      {rows.map((word) => (
        <WordRow key={word.id} word={word} onSave={saveTranslation} onError={(message) => setSaveErrors((current) => [...current, message])} />
      ))}
      {canLoadMore ? <div ref={sentinelRef} className="admin-words-sentinel h-px w-full" /> : null}
      {loadError ? <WordsMessage text={loadError} /> : null}
      {saveErrors.map((message, index) => (
        <WordsMessage key={index} text={message} />
      ))}
    </div>
  );
}

/** Mutually exclusive source-language picker (one active button). */
function LanguagePicker({ languages, selectedId, onSelect }: { languages: Language[]; selectedId: number | null; onSelect: (id: number) => void }) {
  const t = useT();
  return (
    <div className="grid gap-1.5">
      <span className="text-sm font-semibold text-label">{t("admin.words.sourceLanguage")}</span>
      <div className="admin-words-languages flex flex-wrap gap-1 rounded-lg border border-line bg-muted p-1" role="radiogroup">
        {languages.map((language) => {
          const active = language.id === selectedId;
          return (
            <button
              key={language.id}
              type="button"
              className={cn(
                "admin-words-language rounded-md px-3 py-1.5 text-sm font-semibold text-secondary",
                active && "is-active bg-panel text-main shadow-panel"
              )}
              role="radio"
              data-language-id={language.id}
              aria-checked={active}
              onClick={() => onSelect(language.id)}
            >
              {language.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Admin → Words (#adminWordsPanel content): pick a source language and a
 * translation language (default English), search by word or lemma, and edit
 * the shared canonical translation inline, including empty cells. Personal
 * overrides are never touched. Every entry starts from the first language.
 */
export function WordsPanel() {
  const t = useT();
  const meta = useAdminWordLanguages();
  const [languageId, setLanguageId] = useState<number | null>(null);
  const [nativeLanguage, setNativeLanguage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search.trim(), SEARCH_DEBOUNCE_MS);

  if (meta.isPending) {
    return <WordsMessage text={t("admin.words.loading")} />;
  }
  if (meta.isError) {
    return <WordsMessage text={meta.error.message || t("admin.words.loadError")} />;
  }

  const languages = meta.data.languages ?? [];
  const nativeOptions = meta.data.nativeLanguageOptions?.length ? meta.data.nativeLanguageOptions : ["English"];
  const selectedId = languageId ?? languages[0]?.id ?? null;
  const selectedNative = nativeLanguage ?? defaultNativeLanguage(nativeOptions);

  return (
    <div className="admin-words grid gap-4">
      <div className="grid gap-1">
        <h2 className="text-base font-bold">{t("admin.words.title")}</h2>
        <p className="text-sm text-secondary">{t("admin.words.subtitle")}</p>
      </div>
      <div className="grid gap-3">
        <LanguagePicker languages={languages} selectedId={selectedId} onSelect={setLanguageId} />
        <div className="flex flex-col gap-3 desktop:flex-row desktop:items-end">
          <label className="grid gap-1.5 text-sm font-semibold text-label desktop:w-48">
            <span>{t("admin.words.nativeLanguage")}</span>
            <select className={cn("admin-words-native", FIELD_INPUT_CLASS)} value={selectedNative} onChange={(event) => setNativeLanguage(event.target.value)}>
              {nativeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-semibold text-label desktop:flex-1">
            <span>{t("admin.words.search")}</span>
            <Input
              className="admin-words-search h-11 bg-panel text-main"
              type="search"
              placeholder={t("admin.words.searchPlaceholder")}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
        </div>
      </div>
      {selectedId == null ? (
        <div className="admin-words-list max-h-[28rem] overflow-y-auto rounded-md border border-line">
          <WordsMessage text={t("admin.words.noLanguages")} />
        </div>
      ) : (
        <WordsList
          key={`${selectedId}:${selectedNative}:${debouncedSearch}`}
          languageId={selectedId}
          nativeLanguage={selectedNative}
          search={debouncedSearch}
        />
      )}
    </div>
  );
}

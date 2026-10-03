import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { m } from "motion/react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Text } from "@/components/ui/text";
import { ListRow } from "@/components/app/ListRow";
import { Segmented } from "@/components/app/Segmented";
import { errorMessage, type AdminWord, type Language } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { MOTION_FADE } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { defaultNativeLanguage } from "./admin-logic";
import { useDebouncedValue } from "./use-debounced-value";
import { ADMIN_WORDS_PAGE_SIZE, useAdminWordLanguages, useAdminWords, useSaveCanonicalTranslation } from "./queries";

const SEARCH_DEBOUNCE_MS = 250;
const FIELD_LABEL_CLASS = "grid gap-1.5 text-caption font-medium text-label";

/** A muted one-line message inside the panel or list (loading, empty and error states). */
function WordsMessage({ text }: { text: string }) {
  return (
    <Text className="admin-words-message px-4 py-4" tone="muted">
      {text}
    </Text>
  );
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
      onError(errorMessage(error, t("admin.words.saveError")));
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
    <m.div
      className="admin-words-row border-b border-line last:border-b-0"
      data-word-id={word.id}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={MOTION_FADE}
    >
      <ListRow
        className="border-b-0"
        title={<span className="admin-words-term">{word.word}</span>}
        meta={word.lemma && word.lemma !== word.word ? word.lemma : null}
        actions={
          <Input
            className="admin-words-translation w-48 mobile:w-36"
            type="text"
            value={value}
            placeholder={t("admin.words.translationPlaceholder")}
            disabled={saving}
            onChange={(event) => setValue(event.target.value)}
            onBlur={() => void handleBlur()}
            onKeyDown={handleKeyDown}
          />
        }
      />
    </m.div>
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

  const loadError = words.error ? errorMessage(words.error, t("admin.words.loadError")) : "";

  return (
    <div ref={listRef} className="admin-words-list max-h-[28rem] overflow-y-auto">
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
      <Text variant="caption" tone="label" className="font-medium">
        {t("admin.words.sourceLanguage")}
      </Text>
      <Segmented
        className="admin-words-languages w-fit max-w-full flex-wrap"
        aria-label={t("admin.words.sourceLanguage")}
        value={String(selectedId)}
        onValueChange={(id) => onSelect(Number(id))}
        options={languages.map((language) => ({
          value: String(language.id),
          label: language.name,
          itemProps: { className: "admin-words-language", "data-language-id": String(language.id) }
        }))}
      />
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
    return <WordsMessage text={errorMessage(meta.error, t("admin.words.loadError"))} />;
  }

  const languages = meta.data.languages ?? [];
  const nativeOptions = meta.data.nativeLanguageOptions?.length ? meta.data.nativeLanguageOptions : ["English"];
  const selectedId = languageId ?? languages[0]?.id ?? null;
  const selectedNative = nativeLanguage ?? defaultNativeLanguage(nativeOptions);

  return (
    <div className="admin-words grid gap-4">
      <div className="grid gap-1">
        <Text variant="heading">{t("admin.words.title")}</Text>
        <Text tone="muted">{t("admin.words.subtitle")}</Text>
      </div>
      <div className="grid gap-3">
        <LanguagePicker languages={languages} selectedId={selectedId} onSelect={setLanguageId} />
        <div className="flex flex-col gap-3 desktop:flex-row desktop:items-end">
          <Label className={cn(FIELD_LABEL_CLASS, "desktop:w-48")}>
            <span>{t("admin.words.nativeLanguage")}</span>
            <NativeSelect className="admin-words-native" value={selectedNative} onChange={(event) => setNativeLanguage(event.target.value)}>
              {nativeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </NativeSelect>
          </Label>
          <Label className={cn(FIELD_LABEL_CLASS, "desktop:flex-1")}>
            <span>{t("admin.words.search")}</span>
            <Input
              className="admin-words-search"
              type="search"
              variant="search"
              placeholder={t("admin.words.searchPlaceholder")}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </Label>
        </div>
      </div>
      {selectedId == null ? (
        <div className="admin-words-list max-h-[28rem] overflow-y-auto">
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

import { useRef, type ReactNode } from "react";
import { XIcon } from "lucide-react";
import { SettingRow, SettingSection, SettingSelect } from "@/components/app/SettingRow";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useIsMobileLayout } from "@/lib/hooks/use-media-query";
import { useT } from "@/lib/i18n";
import { useReaderPreferencesStore } from "@/stores/reader-preferences";

const WORDS_PER_PAGE_OPTIONS = ["fit", "100", "250", "500", "1000"] as const;

/** Text widths (px) offered in the settings; 0 is automatic. A saved width outside this list gets its own entry. */
const TEXT_WIDTH_OPTIONS = [0, 560, 680, 800, 960, 1120];

/** Stacks a wide control under its label at every width: the panel is too narrow for a side-by-side row. */
const STACKED_ROW = "flex-col items-stretch has-[>[data-slot=field-content]]:items-stretch [&>div:last-child]:w-full";

/** Marks the panel and its trigger, so the reader's document listeners leave interactions inside them alone. */
export const READER_SETTINGS_ATTRIBUTE = "data-reader-settings";

interface SettingsFormProps {
  /** Whether the "show word spaces" option applies (a language written without spaces). */
  showWordSpacesOption: boolean;
  onWordsPerPageChange: (value: string) => void;
  onClose: () => void;
  /** The panel's heading element, which the Popover and the Sheet each label differently. */
  title: ReactNode;
}

/** The panel body shared by the desktop popover and the mobile sheet: heading, close control and every reader setting. */
function SettingsForm({ showWordSpacesOption, onWordsPerPageChange, onClose, title }: SettingsFormProps) {
  const t = useT();
  const isMobile = useIsMobileLayout();
  const wordsPerPage = useReaderPreferencesStore((state) => state.wordsPerPage);
  const fontSize = useReaderPreferencesStore((state) => state.fontSize);
  const textWidth = useReaderPreferencesStore((state) => state.focusPanelWidth);
  const autoMarkKnown = useReaderPreferencesStore((state) => state.autoMarkKnownOnPageTurn);
  const autoMarkLearning = useReaderPreferencesStore((state) => state.autoMarkLearningOnClick);
  const showWordSpaces = useReaderPreferencesStore((state) => state.showWordSpaces);
  const highlightOpacity = useReaderPreferencesStore((state) => state.highlightOpacity);
  const setPreference = useReaderPreferencesStore((state) => state.setPreference);
  const widthOptions = TEXT_WIDTH_OPTIONS.includes(textWidth) ? TEXT_WIDTH_OPTIONS : [...TEXT_WIDTH_OPTIONS, textWidth].sort((a, b) => a - b);

  return (
    <>
      <div className="flex items-center justify-between gap-3 pb-3">
        {title}
        <button
          type="button"
          className="inline-flex size-8 items-center justify-center rounded-md text-secondary hover:bg-hover hover:text-foreground"
          aria-label={t("reader.closeSettings")}
          onClick={onClose}
        >
          <XIcon className="size-4" />
        </button>
      </div>
      <div className="grid gap-5">
        <SettingSection title={t("reader.settingsAppearance")}>
          <SettingRow stacked className={STACKED_ROW} label={t("reader.fontSize")} htmlFor="readerFontSize" labelId="readerFontSizeLabel">
            <div className="flex w-full items-center gap-3">
              <Slider
                id="readerFontSize"
                aria-labelledby="readerFontSizeLabel"
                min={16}
                max={34}
                step={1}
                value={[fontSize]}
                onValueChange={([value]) => setPreference("fontSize", value)}
              />
              <span className="w-10 shrink-0 text-right text-sm text-secondary tabular-nums">{fontSize}</span>
            </div>
          </SettingRow>
          {!isMobile && (
            <SettingRow stacked className={STACKED_ROW} label={t("reader.textWidth")} description={t("reader.textWidthHint")} htmlFor="readerTextWidth">
              <Select value={String(textWidth)} onValueChange={(value) => setPreference("focusPanelWidth", Number(value))}>
                <SettingSelect id="readerTextWidth">
                  <SelectValue />
                </SettingSelect>
                <SelectContent {...{ [READER_SETTINGS_ATTRIBUTE]: "" }}>
                  {widthOptions.map((width) => (
                    <SelectItem key={width} value={String(width)}>
                      {width === 0 ? t("reader.textWidthAuto") : `${width} px`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </SettingRow>
          )}
          <SettingRow
            stacked
            className={STACKED_ROW}
            label={t("reader.highlightOpacity")}
            description={t("reader.highlightOpacityHint")}
            htmlFor="readerHighlightOpacity"
            labelId="readerHighlightOpacityLabel"
          >
            <div className="flex w-full items-center gap-3">
              <Slider
                id="readerHighlightOpacity"
                aria-labelledby="readerHighlightOpacityLabel"
                min={0.05}
                max={0.45}
                step={0.05}
                value={[highlightOpacity]}
                onValueChange={([value]) => setPreference("highlightOpacity", Number(value.toFixed(2)))}
              />
              <span className="w-10 shrink-0 text-right text-sm text-secondary tabular-nums">{Math.round(highlightOpacity * 100)}%</span>
            </div>
          </SettingRow>
          {showWordSpacesOption && (
            <SettingRow
              id="readerShowWordSpacesRow"
              label={t("reader.showWordSpacesLabel")}
              description={t("reader.showWordSpacesHint")}
              htmlFor="readerShowWordSpaces"
            >
              <Switch id="readerShowWordSpaces" checked={showWordSpaces} onCheckedChange={(checked) => setPreference("showWordSpaces", checked)} />
            </SettingRow>
          )}
        </SettingSection>
        <SettingSection title={t("reader.settingsBehaviour")}>
          <SettingRow stacked className={STACKED_ROW} label={t("reader.wordsPerPage")} htmlFor="readerWordsPerPage" labelId="readerWordsPerPageLabel">
            <Select value={String(wordsPerPage)} onValueChange={onWordsPerPageChange}>
              <SettingSelect id="readerWordsPerPage" aria-labelledby="readerWordsPerPageLabel">
                <SelectValue />
              </SettingSelect>
              <SelectContent {...{ [READER_SETTINGS_ATTRIBUTE]: "" }}>
                {WORDS_PER_PAGE_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option === "fit" ? t("reader.fitToPage") : option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingRow>
          <SettingRow label={t("reader.autoMarkKnownLabel")} description={t("reader.autoMarkKnownHint")} htmlFor="readerAutoMarkKnown">
            <Switch id="readerAutoMarkKnown" checked={autoMarkKnown} onCheckedChange={(checked) => setPreference("autoMarkKnownOnPageTurn", checked)} />
          </SettingRow>
          <SettingRow label={t("reader.autoMarkLearningLabel")} description={t("reader.autoMarkLearningHint")} htmlFor="readerAutoMarkLearning">
            <Switch id="readerAutoMarkLearning" checked={autoMarkLearning} onCheckedChange={(checked) => setPreference("autoMarkLearningOnClick", checked)} />
          </SettingRow>
        </SettingSection>
      </div>
    </>
  );
}

export interface ReaderSettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  showWordSpacesOption: boolean;
  onWordsPerPageChange: (value: string) => void;
}

/**
 * The Aa button (#readerSettingsButton) and the reader settings it toggles: a
 * non-modal popover on desktop, a non-modal bottom sheet on mobile. Both float
 * over the text without resizing it, so changes preview live. While open, a
 * transparent scrim behind the top bar's controls takes outside clicks and
 * taps, so they close the panel without reaching the text and its gestures.
 * Escape is closed by Radix; the page orders it against its other layers.
 */
export function ReaderSettings({ open, onOpenChange, showWordSpacesOption, onWordsPerPageChange }: ReaderSettingsProps) {
  const t = useT();
  const isMobile = useIsMobileLayout();
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const button = (
    <button
      ref={buttonRef}
      id="readerSettingsButton"
      className="reader-topbar-button"
      type="button"
      aria-label={t("reader.settingsButton")}
      {...{ [READER_SETTINGS_ATTRIBUTE]: "" }}
    >
      Aa
    </button>
  );
  const scrim = open ? <div className="reader-settings-scrim" aria-hidden /> : null;
  // Focus goes back to Aa however the panel closed (the page's own focus handling would otherwise leave it on the text).
  const returnFocus = (event: Event) => {
    event.preventDefault();
    buttonRef.current?.focus();
  };
  const form = (title: ReactNode) => (
    <SettingsForm showWordSpacesOption={showWordSpacesOption} onWordsPerPageChange={onWordsPerPageChange} onClose={() => onOpenChange(false)} title={title} />
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange} modal={false}>
        <SheetTrigger asChild>{button}</SheetTrigger>
        {scrim}
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="z-50 max-h-[60dvh] gap-0 overflow-y-auto rounded-t-xl p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
          {...{ [READER_SETTINGS_ATTRIBUTE]: "" }}
          aria-describedby={undefined}
          onCloseAutoFocus={returnFocus}
        >
          {form(<SheetTitle className="text-base font-bold">{t("reader.settingsTitle")}</SheetTitle>)}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{button}</PopoverTrigger>
      {scrim}
      <PopoverContent
        align="end"
        sideOffset={6}
        className="max-h-[var(--radix-popover-content-available-height)] w-[22rem] overflow-y-auto p-4"
        {...{ [READER_SETTINGS_ATTRIBUTE]: "" }}
        onCloseAutoFocus={returnFocus}
      >
        {form(<h2 className="text-base font-bold">{t("reader.settingsTitle")}</h2>)}
      </PopoverContent>
    </Popover>
  );
}

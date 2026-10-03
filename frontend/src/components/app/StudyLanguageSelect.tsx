import { useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { toastError } from "@/components/app/toast";
import { Flag } from "@/components/app/Flag";
import { PlusIcon } from "lucide-react";
import { Segmented } from "@/components/app/Segmented";
import { IconButton } from "@/components/ui/icon-button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Text } from "@/components/ui/text";
import { useT } from "@/lib/i18n";
import { studyLanguageLabelKey, studyLanguageMenuOptions } from "@/lib/study-language";
import { cn } from "@/lib/utils";
import { useAvailableStudyLanguages, useStudyLanguageStore } from "@/stores/study-language";

/** Flag in a small rounded frame with a hairline border (light flags, e.g. Japan's, stay visible on the light chip); the SVG fills the frame. */
function FlagChip({ language, className }: { language: string; className?: string }) {
  return (
    <span className={cn("inline-flex shrink-0 overflow-hidden rounded-control-sm border border-line-strong [&_svg]:size-full", className)}>
      <Flag language={language} />
    </span>
  );
}

export interface StudyLanguageSelectProps {
  className?: string;
}

/**
 * The menu bar's study-language control: one flag button per enrolled
 * language (switching reloads onto /dashboard) and the "+" menu to enrol in a
 * new one. Reads and writes the study-language store; no other props.
 */
export function StudyLanguageSelect({ className }: StudyLanguageSelectProps) {
  const t = useT();
  const enrolled = useAvailableStudyLanguages();
  const { selectedId, languages, options, nativeLanguage, switchLanguage, addLanguage } = useStudyLanguageStore(
    useShallow((state) => ({
      selectedId: state.selectedId,
      languages: state.languages,
      options: state.studyLanguageOptions,
      nativeLanguage: state.nativeLanguage,
      switchLanguage: state.switchLanguage,
      addLanguage: state.addLanguage
    }))
  );
  const menuOptions = useMemo(() => studyLanguageMenuOptions(options, languages, nativeLanguage), [options, languages, nativeLanguage]);
  const hasAddable = menuOptions.some((option) => !option.enrolled && !option.reasonKey);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState("");
  const [adding, setAdding] = useState(false);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    setStatus("");
  }

  async function handleAdd(name: string) {
    setOpen(false);
    setAdding(true);
    try {
      await addLanguage(name);
    } catch (error) {
      toastError(error);
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className={cn("contents", className)}>
      <div id="studyLanguageButtons" className="mobile:min-w-0 mobile:flex-initial mobile:overflow-x-auto">
        <Segmented
          aria-label={t("learning.studyLanguage")}
          size="sm"
          className="w-fit"
          value={enrolled.find((language) => language.id === selectedId)?.name ?? ""}
          onValueChange={switchLanguage}
          options={enrolled.map((language) => {
            const label = t(studyLanguageLabelKey(language.name));
            return {
              value: language.name,
              label: <FlagChip language={language.name} className="h-4 w-6" />,
              itemProps: { className: "mobile:flex-none mobile:px-2", "data-language-name": language.name, "aria-label": label, title: label }
            };
          })}
        />
      </div>
      <div className="relative mobile:z-[2] mobile:flex-none">
        <DropdownMenu open={open} onOpenChange={handleOpenChange}>
          <DropdownMenuTrigger asChild>
            <IconButton id="studyLanguageAddButton" variant="secondary" aria-label={t("learning.add")} disabled={menuOptions.length === 0 || adding}>
              <PlusIcon />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent id="studyLanguageDropdown" align="end" className="min-w-[160px]">
            {menuOptions.length === 0 ? (
              <Text variant="caption" tone="label" className="block px-2 py-2">
                {t("learning.allAdded")}
              </Text>
            ) : null}
            {menuOptions.map(({ name, enrolled: isEnrolled, reasonKey }) => {
              const reason = reasonKey ? t(reasonKey) : isEnrolled ? t("learning.alreadyAdded") : "";
              return (
                <DropdownMenuItem
                  key={name}
                  className={cn(reason && "text-label")}
                  data-language-name={name}
                  data-disabled-reason={reason || undefined}
                  aria-disabled={reason ? true : undefined}
                  title={reason || undefined}
                  onSelect={(event) => {
                    if (reason) {
                      event.preventDefault();
                      setStatus(reason);
                      return;
                    }
                    void handleAdd(name);
                  }}
                >
                  <FlagChip language={name} className="h-5 w-7" />
                  <span>{t(studyLanguageLabelKey(name))}</span>
                </DropdownMenuItem>
              );
            })}
            {status || (menuOptions.length > 0 && !hasAddable) ? (
              <Text variant="caption" tone="label" className="block px-2 py-2" data-study-language-menu-status>
                {status || t("learning.noAvailableForNative")}
              </Text>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

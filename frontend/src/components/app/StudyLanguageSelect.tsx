import { useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { toastError } from "@/components/app/toast";
import { Flag } from "@/components/app/Flag";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useT } from "@/lib/i18n";
import { studyLanguageLabelKey, studyLanguageMenuOptions } from "@/lib/study-language";
import { cn } from "@/lib/utils";
import { useAvailableStudyLanguages, useStudyLanguageStore } from "@/stores/study-language";

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
      <div id="studyLanguageButtons" className="flex items-center gap-1.5" role="group" aria-label={t("learning.studyLanguage")}>
        {enrolled.map((language) => {
          const active = language.id === selectedId;
          const label = t(studyLanguageLabelKey(language.name));
          return (
            <button
              key={language.id}
              className={cn("study-language-button", active && "is-active")}
              type="button"
              data-language-name={language.name}
              aria-pressed={active}
              aria-label={label}
              title={label}
              onClick={() => switchLanguage(language.name)}
            >
              <Flag language={language.name} />
            </button>
          );
        })}
      </div>
      <div className="study-language-add-wrap relative">
        <DropdownMenu open={open} onOpenChange={handleOpenChange}>
          <DropdownMenuTrigger asChild>
            <button
              id="studyLanguageAddButton"
              className="study-language-add-button grid h-[42px] w-[42px] place-items-center rounded-md border border-line bg-panel text-brand hover:bg-hover"
              type="button"
              disabled={menuOptions.length === 0 || adding}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current stroke-[2]">
                <path d="M12 5v14M5 12h14" />
              </svg>
              <span className="visually-hidden">{t("learning.add")}</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            id="studyLanguageDropdown"
            align="end"
            className="study-language-dropdown min-w-[160px] rounded-md border border-line bg-panel p-1 shadow-panel"
          >
            {menuOptions.length === 0 ? <p className="px-2 py-2 text-sm text-secondary">{t("learning.allAdded")}</p> : null}
            {menuOptions.map(({ name, enrolled: isEnrolled, reasonKey }) => {
              const reason = reasonKey ? t(reasonKey) : isEnrolled ? t("learning.alreadyAdded") : "";
              return (
                <DropdownMenuItem
                  key={name}
                  className={cn(
                    "study-language-dropdown-item flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm font-semibold",
                    reason ? "text-secondary" : "text-label"
                  )}
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
                  <span className="study-language-dropdown-flag">
                    <Flag language={name} />
                  </span>
                  <span>{t(studyLanguageLabelKey(name))}</span>
                </DropdownMenuItem>
              );
            })}
            {status || (menuOptions.length > 0 && !hasAddable) ? (
              <p className="px-2 py-2 text-sm text-secondary" data-study-language-menu-status>
                {status || t("learning.noAvailableForNative")}
              </p>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

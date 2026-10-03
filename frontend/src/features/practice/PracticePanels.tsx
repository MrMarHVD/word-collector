import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { SettingRow, SettingSection } from "@/components/app/SettingRow";
import { toast, toastError } from "@/components/app/toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Text } from "@/components/ui/text";
import { errorMessage } from "@/lib/api";
import { useIsMobileLayout } from "@/lib/hooks/use-media-query";
import { useFormatCount, useT } from "@/lib/i18n";
import { studyLanguageLabelKey } from "@/lib/study-language";
import { useSessionStore } from "@/stores/session";
import { useStudyLanguageStore } from "@/stores/study-language";
import { practiceWordsPerSession } from "./practice-session";
import { usePracticeStore, type PracticePanel } from "./practice-store";
import { usePracticeOwner, useSaveWordsPerSession, useStartPractice } from "./use-practice";

const PANELS: { id: PracticePanel; labelKey: string }[] = [
  { id: "practice", labelKey: "practice.practiceTab" },
  { id: "settings", labelKey: "practice.settingsTab" }
];

const PANEL_CLASS = "gap-0 p-6";
const SUMMARY_ROW_CLASS = "flex items-center justify-between gap-3 py-3";

/** The words-per-session setting of the signed-in user. */
function useWordsPerSession(): number {
  return practiceWordsPerSession(useSessionStore((state) => state.user?.practiceWordsPerSession));
}

/** Two-column layout outside a session: kit Tabs (vertical on desktop, horizontal on mobile) beside the panel. */
export function PracticeShell({ children }: { children: ReactNode }) {
  const t = useT();
  const isMobile = useIsMobileLayout();
  const panel = usePracticeStore((state) => state.panel);
  const showLanding = usePracticeStore((state) => state.showLanding);
  return (
    <Tabs
      value={panel}
      onValueChange={(next) => showLanding(next as PracticePanel)}
      orientation={isMobile ? "horizontal" : "vertical"}
      className="practice-layout gap-4 desktop:flex-row desktop:items-start mobile:flex-col"
    >
      <TabsList aria-label={t("practice.sidebarLabel")} className="practice-sidebar shrink-0 desktop:w-44 mobile:w-full">
        {PANELS.map(({ id, labelKey }) => (
          <TabsTrigger key={id} value={id} data-practice-panel={id} className="min-h-9 px-3">
            {t(labelKey)}
          </TabsTrigger>
        ))}
      </TabsList>
      <div className="practice-main min-w-0 w-full max-w-xl">{children}</div>
    </Tabs>
  );
}

/** Landing panel: the study language, the session size and the two start buttons. */
export function PracticeLanding() {
  const t = useT();
  const formatCount = useFormatCount();
  const wordsPerSession = useWordsPerSession();
  const selectedId = useStudyLanguageStore((state) => state.selectedId);
  const selectedName = useStudyLanguageStore((state) => state.selectedName);
  const status = usePracticeStore((state) => state.status);
  const start = useStartPractice();
  const language = selectedName ? t(studyLanguageLabelKey(selectedName), {}, selectedName) : "";
  return (
    <Card className={PANEL_CLASS}>
      <Text variant="title" as="h2">
        {t("practice.title")}
      </Text>
      <Text tone="muted" className="mt-2">
        {t("practice.intro")}
      </Text>
      <dl className="practice-summary-list mt-4 divide-y divide-line border-y border-line text-body">
        <div className={SUMMARY_ROW_CLASS}>
          <dt className="text-label">{t("practice.studyLanguage")}</dt>
          <dd className="font-medium text-main">{language || t("practice.noLanguage")}</dd>
        </div>
        <div className={SUMMARY_ROW_CLASS}>
          <dt className="text-label">{t("practice.wordsPerSession")}</dt>
          <dd className="font-medium text-main">{formatCount(wordsPerSession)}</dd>
        </div>
      </dl>
      <Button size="lg" className="mt-6 w-full" data-practice-start disabled={!selectedId} onClick={() => void start()}>
        {t("practice.start")}
      </Button>
      <Button variant="secondary" size="lg" className="mt-3 w-full" data-practice-start-marked disabled={!selectedId} onClick={() => void start("marked")}>
        {t("practice.startMarked")}
      </Button>
      <Text id="practiceStatus" variant="caption" as="p" tone="muted" className="mt-3 min-h-5" role="status">
        {status}
      </Text>
    </Card>
  );
}

/** Settings panel: the words-per-session setting, saved on blur or Enter. */
export function PracticeSettings() {
  const t = useT();
  const wordsPerSession = useWordsPerSession();
  const save = useSaveWordsPerSession();
  const [value, setValue] = useState(() => String(wordsPerSession));
  const [status, setStatus] = useState("");

  const currentValue = useRef(value);
  const lastAttempt = useRef<string | null>(null);
  const saving = useRef(false);

  function changeValue(next: string) {
    currentValue.current = next;
    setValue(next);
  }

  /**
   * Saves a changed, valid value once per distinct value (Enter then blur does not repeat). A value
   * changed while a save is pending is committed after it settles. An invalid value shows the
   * message once and the input resets to the saved value.
   */
  async function commit() {
    const attempted = currentValue.current;
    if (saving.current || attempted === String(wordsPerSession) || attempted === lastAttempt.current) {
      return;
    }
    lastAttempt.current = attempted;
    const count = Number(attempted);
    if (!Number.isInteger(count) || count < 1 || count > 200) {
      setStatus(t("practice.wordsPerSessionInvalid"));
      toast.error(t("practice.wordsPerSessionInvalid"));
      changeValue(String(wordsPerSession));
      lastAttempt.current = null;
      return;
    }
    saving.current = true;
    try {
      const result = await save.mutateAsync(count);
      const saved = String(practiceWordsPerSession(result.user.practiceWordsPerSession));
      if (currentValue.current === attempted) {
        changeValue(saved);
      }
      setStatus(t("settings.saved"));
      toast.success(t("settings.saved"));
    } catch (error) {
      lastAttempt.current = null;
      setStatus(errorMessage(error));
      toastError(error);
    } finally {
      saving.current = false;
    }
    if (currentValue.current !== attempted && currentValue.current !== lastAttempt.current) {
      void commit();
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void commit();
  }

  return (
    <div className="grid gap-4">
      <Text variant="heading" as="h2">
        {t("practice.settingsTitle")}
      </Text>
      <form id="practiceSettingsForm" onSubmit={submit}>
        <SettingSection title={t("practice.settingsSession")}>
          <SettingRow label={t("practice.wordsPerSession")} description={t("settings.practiceWordsPerSessionHint")} htmlFor="practiceWordsPerSession">
            <Input
              id="practiceWordsPerSession"
              className="w-24"
              type="number"
              min="1"
              max="200"
              step="1"
              value={value}
              onChange={(event) => changeValue(event.target.value)}
              onBlur={() => void commit()}
            />
          </SettingRow>
        </SettingSection>
        <p id="practiceSettingsStatus" className="sr-only" role="status" aria-live="off">
          {status}
        </p>
      </form>
    </div>
  );
}

/** Shown when there are no learning words to practise. */
export function PracticeEmpty() {
  const t = useT();
  const showLanding = usePracticeStore((state) => state.showLanding);
  return (
    <Card className={`${PANEL_CLASS} text-center`}>
      <Text variant="title" as="h2">
        {t("practice.title")}
      </Text>
      <Text tone="muted" className="mt-3">
        {t("practice.emptyBody")}
      </Text>
      <Button variant="secondary" size="lg" className="mx-auto mt-6" data-practice-done onClick={() => showLanding()}>
        {t("practice.back")}
      </Button>
    </Card>
  );
}

/** Shown when fewer valid words exist than requested: start with those, or go back. */
export function PracticeNotice() {
  const t = useT();
  const formatCount = useFormatCount();
  const notice = usePracticeStore((state) => state.notice);
  const showLanding = usePracticeStore((state) => state.showLanding);
  const begin = usePracticeStore((state) => state.begin);
  const owner = usePracticeOwner();
  if (!notice) {
    return null;
  }
  return (
    <Card className={`${PANEL_CLASS} text-center`}>
      <Text variant="title" as="h2">
        {t("practice.title")}
      </Text>
      <Text tone="muted" className="mt-3">
        {t("practice.onlyValid", { count: formatCount(notice.validCount) })}
      </Text>
      <div className="practice-notice-actions mt-6 flex flex-wrap justify-center gap-3">
        <Button size="lg" data-practice-begin onClick={() => begin(notice.words, owner ?? "")}>
          {t("practice.startWith", { count: formatCount(notice.words.length) })}
        </Button>
        <Button variant="secondary" size="lg" data-practice-done onClick={() => showLanding()}>
          {t("practice.back")}
        </Button>
      </div>
    </Card>
  );
}

/** End-of-session results, with "again" and "back". */
export function PracticeSummary() {
  const t = useT();
  const formatCount = useFormatCount();
  const results = usePracticeStore((state) => state.results) ?? { known: 0, unknown: 0 };
  const showLanding = usePracticeStore((state) => state.showLanding);
  const start = useStartPractice();
  return (
    <Card className={`${PANEL_CLASS} text-center`}>
      <Text variant="title" as="h2">
        {t("practice.doneTitle")}
      </Text>
      <Text tone="muted" className="mt-2">
        {t("practice.doneBody", { total: formatCount(results.known + results.unknown) })}
      </Text>
      <dl className="practice-summary-list mt-4 divide-y divide-line border-y border-line text-left text-body">
        <div className={SUMMARY_ROW_CLASS}>
          <dt className="text-label">{t("practice.knownCount")}</dt>
          <dd className="font-medium text-brand">{formatCount(results.known)}</dd>
        </div>
        <div className={SUMMARY_ROW_CLASS}>
          <dt className="text-label">{t("practice.learningCount")}</dt>
          <dd className="font-medium text-main">{formatCount(results.unknown)}</dd>
        </div>
      </dl>
      <div className="practice-notice-actions mt-6 flex flex-wrap justify-center gap-3">
        <Button size="lg" data-practice-start onClick={() => void start()}>
          {t("practice.again")}
        </Button>
        <Button variant="secondary" size="lg" data-practice-done onClick={() => showLanding()}>
          {t("practice.back")}
        </Button>
      </div>
    </Card>
  );
}

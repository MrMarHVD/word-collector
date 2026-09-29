import { useState, type FormEvent, type ReactNode } from "react";
import { errorMessage } from "@/lib/api";
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

const PANEL_CLASS = "practice-panel rounded-lg border border-line bg-panel p-6 shadow-panel";
const START_BUTTON_CLASS = "practice-start-button min-h-11 rounded-md bg-brand px-6 text-sm font-bold text-white hover:bg-brand-strong";
const SECONDARY_BUTTON_CLASS = "practice-secondary-button min-h-11 rounded-md border border-line bg-panel px-5 text-sm font-bold text-brand hover:bg-hover";
const SUMMARY_ROW_CLASS = "flex items-center justify-between gap-3 rounded-md border border-line bg-subtle px-4 py-3";

/** The words-per-session setting of the signed-in user. */
function useWordsPerSession(): number {
  return practiceWordsPerSession(useSessionStore((state) => state.user?.practiceWordsPerSession));
}

/** Two-column layout outside a session: the practice/settings sidebar menu beside the panel. */
export function PracticeShell({ children }: { children: ReactNode }) {
  const t = useT();
  const panel = usePracticeStore((state) => state.panel);
  const showLanding = usePracticeStore((state) => state.showLanding);
  return (
    <section className="practice-layout grid items-start gap-3.5">
      <aside className="practice-sidebar rounded-lg border border-line bg-panel p-3.5 shadow-panel">
        <nav className="practice-sidebar-menu grid gap-1" aria-label={t("practice.sidebarLabel")}>
          {PANELS.map(({ id, labelKey }) => (
            <button
              key={id}
              className="practice-sidebar-button rounded-md px-3 py-2 text-sm font-semibold text-secondary"
              type="button"
              data-practice-panel={id}
              aria-current={panel === id ? "page" : "false"}
              onClick={() => showLanding(id)}
            >
              {t(labelKey)}
            </button>
          ))}
        </nav>
      </aside>
      <div className="practice-main min-w-0">{children}</div>
    </section>
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
    <section className={PANEL_CLASS}>
      <h2 className="text-2xl font-bold tracking-tight">{t("practice.title")}</h2>
      <p className="mt-2 text-sm text-secondary">{t("practice.intro")}</p>
      <dl className="practice-summary-list mt-5 grid gap-2 text-sm">
        <div className={SUMMARY_ROW_CLASS}>
          <dt className="font-semibold text-label">{t("practice.studyLanguage")}</dt>
          <dd className="font-bold text-main">{language || t("practice.noLanguage")}</dd>
        </div>
        <div className={SUMMARY_ROW_CLASS}>
          <dt className="font-semibold text-label">{t("practice.wordsPerSession")}</dt>
          <dd className="font-bold text-main">{formatCount(wordsPerSession)}</dd>
        </div>
      </dl>
      <button
        className="practice-start-button mt-6 min-h-12 w-full rounded-md bg-brand px-4 text-base font-bold text-white hover:bg-brand-strong disabled:opacity-50 disabled:cursor-not-allowed"
        type="button"
        data-practice-start
        disabled={!selectedId}
        onClick={() => void start()}
      >
        {t("practice.start")}
      </button>
      <button
        className="practice-secondary-button mt-3 min-h-12 w-full rounded-md border border-line bg-panel px-4 text-base font-bold text-brand hover:bg-hover disabled:opacity-50 disabled:cursor-not-allowed"
        type="button"
        data-practice-start-marked
        disabled={!selectedId}
        onClick={() => void start("marked")}
      >
        {t("practice.startMarked")}
      </button>
      <p id="practiceStatus" className="status mt-3 min-h-5 text-sm text-secondary" role="status">
        {status}
      </p>
    </section>
  );
}

/** Settings panel: the words-per-session form, saved to the user's settings. */
export function PracticeSettings() {
  const t = useT();
  const wordsPerSession = useWordsPerSession();
  const save = useSaveWordsPerSession();
  const [value, setValue] = useState(() => String(wordsPerSession));
  const [status, setStatus] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(t("settings.saving"));
    try {
      const result = await save.mutateAsync(Number(value));
      setValue(String(practiceWordsPerSession(result.user.practiceWordsPerSession)));
      setStatus(t("settings.saved"));
    } catch (error) {
      setStatus(errorMessage(error));
    }
  }

  return (
    <section className={PANEL_CLASS}>
      <h2 className="text-2xl font-bold tracking-tight">{t("practice.settingsTitle")}</h2>
      <p className="mt-2 text-sm text-secondary">{t("practice.settingsIntro")}</p>
      <form id="practiceSettingsForm" className="mt-5 grid gap-4" onSubmit={(event) => void submit(event)}>
        <label className="grid gap-1.5 text-sm font-semibold text-label">
          <span>{t("settings.practiceWordsPerSession")}</span>
          <input
            id="practiceWordsPerSession"
            className="min-h-11 rounded-md border border-line bg-panel px-3 text-main outline-none focus:border-brand focus:ring-2 focus:ring-focus"
            type="number"
            min="1"
            max="200"
            step="1"
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        </label>
        <p className="hint min-h-5 text-sm text-secondary">{t("settings.practiceWordsPerSessionHint")}</p>
        <button className="min-h-11 rounded-md bg-brand px-4 text-sm font-bold text-white hover:bg-brand-strong" type="submit" disabled={save.isPending}>
          {t("settings.save")}
        </button>
        <p id="practiceSettingsStatus" className="status min-h-5 text-sm text-secondary" role="status">
          {status}
        </p>
      </form>
    </section>
  );
}

/** Shown when there are no learning words to practise. */
export function PracticeEmpty() {
  const t = useT();
  const showLanding = usePracticeStore((state) => state.showLanding);
  return (
    <section className={`${PANEL_CLASS} text-center`}>
      <h2 className="text-2xl font-bold tracking-tight">{t("practice.title")}</h2>
      <p className="mt-3 text-sm text-secondary">{t("practice.emptyBody")}</p>
      <button className={`${SECONDARY_BUTTON_CLASS} mt-6`} type="button" data-practice-done onClick={() => showLanding()}>
        {t("practice.back")}
      </button>
    </section>
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
    <section className={`${PANEL_CLASS} text-center`}>
      <h2 className="text-2xl font-bold tracking-tight">{t("practice.title")}</h2>
      <p className="mt-3 text-sm text-secondary">{t("practice.onlyValid", { count: formatCount(notice.validCount) })}</p>
      <div className="practice-notice-actions mt-6 flex flex-wrap justify-center gap-3">
        <button className={START_BUTTON_CLASS} type="button" data-practice-begin onClick={() => begin(notice.words, owner ?? "")}>
          {t("practice.startWith", { count: formatCount(notice.words.length) })}
        </button>
        <button className={SECONDARY_BUTTON_CLASS} type="button" data-practice-done onClick={() => showLanding()}>
          {t("practice.back")}
        </button>
      </div>
    </section>
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
    <section className={`${PANEL_CLASS} text-center`}>
      <h2 className="text-2xl font-bold tracking-tight">{t("practice.doneTitle")}</h2>
      <p className="mt-2 text-sm text-secondary">{t("practice.doneBody", { total: formatCount(results.known + results.unknown) })}</p>
      <dl className="practice-summary-list mt-5 grid gap-2 text-sm">
        <div className={SUMMARY_ROW_CLASS}>
          <dt className="font-semibold text-label">{t("practice.knownCount")}</dt>
          <dd className="font-bold text-brand">{formatCount(results.known)}</dd>
        </div>
        <div className={SUMMARY_ROW_CLASS}>
          <dt className="font-semibold text-label">{t("practice.learningCount")}</dt>
          <dd className="font-bold text-main">{formatCount(results.unknown)}</dd>
        </div>
      </dl>
      <div className="practice-notice-actions mt-6 flex flex-wrap justify-center gap-3">
        <button className={START_BUTTON_CLASS} type="button" data-practice-start onClick={() => void start()}>
          {t("practice.again")}
        </button>
        <button className={SECONDARY_BUTTON_CLASS} type="button" data-practice-done onClick={() => showLanding()}>
          {t("practice.back")}
        </button>
      </div>
    </section>
  );
}

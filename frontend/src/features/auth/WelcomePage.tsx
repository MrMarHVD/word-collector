import { useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { Flag } from "@/components/app/Flag";
import { toastError } from "@/components/app/toast";
import { useT } from "@/lib/i18n";
import { addableStudyLanguages, studyLanguageLabelKey } from "@/lib/study-language";
import { useSessionStore } from "@/stores/session";
import { useStudyLanguageStore } from "@/stores/study-language";
import "./auth.css";

/**
 * Welcome screen (#welcomeView) shown inside the app shell on "/" and in place
 * of any route the user may not see yet. Signed out: login/register buttons.
 * Signed in without a study language: the first-run language gate, where
 * picking a language enrols in it and reloads onto /dashboard.
 */
export default function WelcomePage() {
  const t = useT();
  const user = useSessionStore((state) => state.user);
  const openAuthScreen = useSessionStore((state) => state.openAuthScreen);
  const { selectedId, languages, options, nativeLanguage, addLanguage } = useStudyLanguageStore(
    useShallow((state) => ({
      selectedId: state.selectedId,
      languages: state.languages,
      options: state.studyLanguageOptions,
      nativeLanguage: state.nativeLanguage,
      addLanguage: state.addLanguage
    }))
  );
  const addable = useMemo(() => addableStudyLanguages(options, languages, nativeLanguage), [options, languages, nativeLanguage]);
  const [pendingLanguage, setPendingLanguage] = useState<string | null>(null);

  async function chooseLanguage(name: string) {
    setPendingLanguage(name);
    try {
      await addLanguage(name);
    } catch (error) {
      toastError(error);
    } finally {
      setPendingLanguage(null);
    }
  }

  return (
    <section id="welcomeView" className="welcome-view grid min-h-[calc(100vh-180px)] place-items-center px-4 py-8">
      <div className="welcome-hero w-full max-w-lg text-center">
        <p className="eyebrow mb-3 text-xs font-bold uppercase tracking-wide text-brand">{t("brand")}</p>
        <h1 className="text-4xl font-black tracking-tight max-md:text-3xl">{t("welcome.title")}</h1>
        <p className="mt-4 text-lg text-secondary">{t("welcome.subtitle")}</p>
        {user && selectedId === null ? (
          <div id="welcomeLanguageGate" className="welcome-language-gate mx-auto mt-8 grid w-full max-w-sm gap-3">
            <p className="text-base font-bold text-main">{t("welcome.chooseStudyLanguage")}</p>
            <div className="welcome-language-grid">
              {addable.length ? (
                addable.map((name) => (
                  <button
                    key={name}
                    className="welcome-language-button"
                    type="button"
                    data-welcome-study-language={name}
                    disabled={pendingLanguage === name}
                    onClick={() => void chooseLanguage(name)}
                  >
                    <span className="welcome-language-flag">
                      <Flag language={name} />
                    </span>
                    <span>{t(studyLanguageLabelKey(name))}</span>
                  </button>
                ))
              ) : (
                <p className="text-sm text-secondary">{t("learning.noAvailableForNative")}</p>
              )}
            </div>
          </div>
        ) : null}
        {!user ? (
          <div id="welcomeActions" className="welcome-actions mx-auto mt-8 grid w-full max-w-xs grid-cols-2 gap-3 max-sm:grid-cols-1">
            <button
              id="welcomeLoginButton"
              className="min-h-12 rounded-md bg-brand px-5 text-sm font-bold text-white hover:bg-brand-strong"
              type="button"
              onClick={() => openAuthScreen({ mode: "login" })}
            >
              {t("auth.login")}
            </button>
            <button
              id="welcomeRegisterButton"
              className="min-h-12 rounded-md border border-line bg-panel px-5 text-sm font-bold text-brand hover:bg-hover"
              type="button"
              onClick={() => openAuthScreen({ mode: "register" })}
            >
              {t("auth.register")}
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

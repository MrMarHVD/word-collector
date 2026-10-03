import { useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { Flag } from "@/components/app/Flag";
import { toastError } from "@/components/app/toast";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { useT } from "@/lib/i18n";
import { addableStudyLanguages, studyLanguageLabelKey } from "@/lib/study-language";
import { useSessionStore } from "@/stores/session";
import { useStudyLanguageStore } from "@/stores/study-language";

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
    <section id="welcomeView" className="grid min-h-[calc(100vh-180px)] place-items-center px-4 py-8">
      <div className="w-full max-w-lg text-center">
        <Text variant="caption" tone="muted" className="mb-3">
          {t("brand")}
        </Text>
        <Text variant="title">{t("welcome.title")}</Text>
        <Text tone="muted" className="mt-4">
          {t("welcome.subtitle")}
        </Text>
        {user && selectedId === null ? (
          <div id="welcomeLanguageGate" className="mx-auto mt-8 grid w-full max-w-sm gap-3">
            <Text variant="heading">{t("welcome.chooseStudyLanguage")}</Text>
            <div className="grid gap-2.5">
              {addable.length ? (
                addable.map((name) => (
                  <Button
                    key={name}
                    variant="secondary"
                    size="lg"
                    className="w-full justify-start"
                    data-welcome-study-language={name}
                    disabled={pendingLanguage === name}
                    onClick={() => void chooseLanguage(name)}
                  >
                    <span className="flex h-5 w-7 shrink-0 overflow-hidden rounded-control border border-line [&_svg]:size-full!">
                      <Flag language={name} />
                    </span>
                    <span>{t(studyLanguageLabelKey(name))}</span>
                  </Button>
                ))
              ) : (
                <Text variant="caption" tone="muted">
                  {t("learning.noAvailableForNative")}
                </Text>
              )}
            </div>
          </div>
        ) : null}
        {!user ? (
          <div id="welcomeActions" className="mx-auto mt-8 grid w-full max-w-xs grid-cols-2 gap-3 mobile:grid-cols-1">
            <Button id="welcomeLoginButton" size="lg" onClick={() => openAuthScreen({ mode: "login" })}>
              {t("auth.login")}
            </Button>
            <Button id="welcomeRegisterButton" variant="secondary" size="lg" onClick={() => openAuthScreen({ mode: "register" })}>
              {t("auth.register")}
            </Button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

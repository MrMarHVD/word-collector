/**
 * Practice actions over the API: starting a session, answering a card
 * (saving "known" answers) and saving the words-per-session setting.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { api, errorMessage, queryKeys, type PracticeMode } from "@/lib/api";
import { refreshStudyData } from "@/lib/api/queries";
import { useT } from "@/lib/i18n";
import { useSessionStore } from "@/stores/session";
import { useStudyLanguageStore } from "@/stores/study-language";
import { advanceCard, canAnswer, isLastCard, recordAnswer, type PracticeAnswer } from "./practice-session";
import { usePracticeStore } from "./practice-store";

/** Identifies whose session is in the store: the signed-in user and the study language. */
export function usePracticeOwner(): string | null {
  const userId = useSessionStore((state) => state.user?.id ?? null);
  const languageId = useStudyLanguageStore((state) => state.selectedId);
  return userId !== null && languageId !== null ? `${userId}:${languageId}` : null;
}

/** Starts a session: the standard one, or only the words marked for practice. */
export function useStartPractice(): (mode?: PracticeMode) => Promise<void> {
  const t = useT();
  const queryClient = useQueryClient();
  const languageId = useStudyLanguageStore((state) => state.selectedId);
  const owner = usePracticeOwner();

  return useCallback(
    async (mode?: PracticeMode) => {
      if (!languageId || !owner) {
        return;
      }
      const store = usePracticeStore.getState();
      store.setStatus(t("practice.loading"));
      let data;
      try {
        // Every start draws a fresh random session, so the cache is never reused.
        data = await queryClient.fetchQuery({
          queryKey: queryKeys.practice.session(languageId, mode ?? null),
          queryFn: () => api.practice.session({ languageId, mode }),
          staleTime: 0
        });
      } catch (error) {
        store.setStatus(errorMessage(error));
        return;
      }

      if (!data.words.length) {
        // The marked-words flow has its own empty message and keeps the user on the
        // landing page so they can still start an automatic session.
        if (mode === "marked") {
          store.setStatus(t("practice.markedEmpty"));
          return;
        }
        store.showEmpty();
        return;
      }
      if (data.insufficient) {
        store.showNotice(data);
        return;
      }
      store.begin(data.words, owner);
    },
    [languageId, owner, queryClient, t]
  );
}

/** Answers the current card, then moves on or finishes the session. */
export function useAnswerCard(): (answer: PracticeAnswer) => Promise<void> {
  const queryClient = useQueryClient();
  const { mutateAsync: markKnown } = useMutation({ mutationFn: (wordId: number) => api.words.setStatus(wordId, "known") });

  return useCallback(
    async (answer: PracticeAnswer) => {
      const store = usePracticeStore.getState();
      if (!canAnswer(store.session)) {
        return;
      }
      const card = store.session.words[store.session.index];
      const recorded = recordAnswer(store.session, answer);
      store.updateSession(() => recorded.session);
      if (recorded.markKnown) {
        try {
          await markKnown(card.wordId);
          store.updateSession((session) => ({ ...session, statusChanged: true }));
        } catch {
          // A failed status write should not stall the session; the word simply
          // stays in its current status and can be reviewed again later.
        }
      }

      const session = usePracticeStore.getState().session;
      if (!session.active) {
        return;
      }
      if (isLastCard(session)) {
        store.finish();
        if (session.statusChanged) {
          void refreshStudyData(queryClient);
        }
        return;
      }
      store.updateSession(advanceCard);
    },
    [markKnown, queryClient]
  );
}

/** PATCH /api/settings with a new words-per-session count, merged into the session user. */
export function useSaveWordsPerSession() {
  return useMutation({
    mutationFn: (practiceWordsPerSession: number) => api.settings.update({ practiceWordsPerSession }),
    onSuccess: (result) => {
      const { user, setUser } = useSessionStore.getState();
      if (user) {
        setUser({ ...user, ...result.user });
      }
    }
  });
}

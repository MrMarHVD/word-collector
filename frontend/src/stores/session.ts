import { create } from "zustand";
import * as authApi from "@/lib/api/auth";
import { setCsrfToken } from "@/lib/api/client";
import type { AuthProviders, User } from "@/lib/api/types";
import { queryClient } from "@/lib/query-client";
import { useStudyLanguageStore } from "@/stores/study-language";

/** Which auth screen (#authView) is open instead of the app shell. */
export interface AuthScreen {
  panel: "login" | "forgot" | "reset";
  /** Login form mode. */
  mode: "login" | "register";
  /** Status message shown under the form (e.g. a verification or OAuth outcome). */
  status: string;
  /** Password-reset token from an emailed link (panel "reset"). */
  resetToken: string | null;
}

export interface SessionState {
  /** "loading" until the first /api/auth/me completes; the UI renders nothing before that, like the legacy app. */
  status: "loading" | "ready";
  /** Signed-in user, or null (the UI then shows the welcome screen in place). */
  user: User | null;
  authProviders: AuthProviders;
  nativeLanguageOptions: string[];
  /** Open auth screen, or null for the app shell. */
  authScreen: AuthScreen | null;
  /** Status text for the email-verification banner (resend outcome, verification result). */
  verifyNotice: string;
  /**
   * GET /api/auth/me: fills this store and the study-language catalogue,
   * restores the study-language selection and, when signed in, closes the
   * auth screen. Resolves to the user (or null). Rejects with ApiError.
   */
  loadSession: () => Promise<User | null>;
  /** Replaces the user (e.g. merged with a PATCH /api/settings result) and syncs the native language. */
  setUser: (user: User | null) => void;
  /** Marks bootstrap finished without loading a session (password-reset links). */
  markReady: () => void;
  /** POST /api/auth/logout, then clears the session. On failure the error is shown in the verification banner. */
  logout: () => Promise<void>;
  /** Drops the user, the query cache and registered feature state (sign-out, account deletion); `forgetStudyLanguage` also removes the persisted language. */
  clearSession: (options?: { forgetStudyLanguage?: boolean }) => void;
  /** Called by the API client on HTTP 401: the user, query cache and registered feature state are dropped and the welcome screen shows in place. */
  handleUnauthorized: () => void;
  /** Opens an auth screen; unspecified fields default to the login panel in login mode with no status. */
  openAuthScreen: (screen?: Partial<AuthScreen>) => void;
  /** Returns from the auth screen to the welcome screen. */
  closeAuthScreen: () => void;
  setVerifyNotice: (message: string) => void;
}

/** Whether the user may open the admin tab (admins and superadmins). */
export function isAdminUser(user: Pick<User, "isAdmin" | "isSuperadmin"> | null): boolean {
  return Boolean(user && (user.isAdmin === true || user.isSuperadmin === true));
}

/** Whether the user may open the superadmin subtab. */
export function isSuperadminUser(user: Pick<User, "isSuperadmin"> | null): boolean {
  return user?.isSuperadmin === true;
}

const DEFAULT_AUTH_SCREEN: AuthScreen = { panel: "login", mode: "login", status: "", resetToken: null };

const sessionResets = new Set<() => void>();

/**
 * Registers a reset for client state kept outside the query cache (module
 * singletons, feature stores). It runs whenever the session ends (sign-out,
 * 401, account deletion), so one user's state never carries over to the next
 * sign-in without a reload. Features register at module load, so the session
 * store never imports (or eagerly loads) feature code.
 */
export function registerSessionReset(reset: () => void): void {
  sessionResets.add(reset);
}

function resetSessionState(): void {
  for (const reset of sessionResets) {
    reset();
  }
}

/** Session and signed-in user. */
export const useSessionStore = create<SessionState>((set, get) => ({
  status: "loading",
  user: null,
  authProviders: {},
  nativeLanguageOptions: [],
  authScreen: null,
  verifyNotice: "",
  loadSession: async () => {
    const result = await authApi.me();
    const studyLanguage = useStudyLanguageStore.getState();
    // The catalogue is set before the user so the first signed-in render already has the language gate.
    studyLanguage.setCatalog({
      languages: result.languages || [],
      studyLanguageOptions: result.studyLanguageOptions || [],
      nativeLanguage: result.user?.nativeLanguage ?? null
    });
    if (result.user) {
      studyLanguage.restoreSelection();
    }
    set({
      status: "ready",
      user: result.user,
      authProviders: result.authProviders || {},
      nativeLanguageOptions: result.nativeLanguageOptions || [],
      ...(result.user ? { authScreen: null } : {})
    });
    return result.user;
  },
  setUser: (user) => {
    useStudyLanguageStore.getState().setCatalog({ nativeLanguage: user?.nativeLanguage ?? null });
    set({ user });
  },
  markReady: () => set({ status: "ready" }),
  logout: async () => {
    try {
      await authApi.logout();
      get().clearSession();
    } catch (error) {
      set({ verifyNotice: error instanceof Error ? error.message : String(error) });
    }
  },
  clearSession: ({ forgetStudyLanguage = false } = {}) => {
    setCsrfToken(null);
    useStudyLanguageStore.getState().reset({ forget: forgetStudyLanguage });
    queryClient.clear();
    resetSessionState();
    set({ user: null, authScreen: null, verifyNotice: "" });
  },
  handleUnauthorized: () => {
    // The token is bound to the expired session; the next sign-in needs a fresh one.
    setCsrfToken(null);
    queryClient.clear();
    resetSessionState();
    set({ user: null, authScreen: null });
  },
  openAuthScreen: (screen = {}) => set({ authScreen: { ...DEFAULT_AUTH_SCREEN, ...screen } }),
  closeAuthScreen: () => set({ authScreen: null }),
  setVerifyNotice: (message) => set({ verifyNotice: message })
}));

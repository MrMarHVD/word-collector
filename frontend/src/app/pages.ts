/**
 * Lazily loaded route pages (contract I1): the default export of
 * src/features/<name>/<Name>Page.tsx. Feature issues replace the page file's
 * contents but keep its path and default export.
 */

import { lazy } from "react";

const loadWelcomePage = () => import("@/features/auth/WelcomePage");
const loadAuthPage = () => import("@/features/auth/AuthPage");

export const WelcomePage = lazy(loadWelcomePage);
export const AuthPage = lazy(loadAuthPage);
export const DashboardPage = lazy(() => import("@/features/dashboard/DashboardPage"));
export const CollectionsPage = lazy(() => import("@/features/collections/CollectionsPage"));
export const LibraryPage = lazy(() => import("@/features/library/LibraryPage"));
export const ReaderRedirect = lazy(() => import("@/features/reader/ReaderRedirect"));
export const ReaderPage = lazy(() => import("@/features/reader/ReaderPage"));
export const PracticePage = lazy(() => import("@/features/practice/PracticePage"));
export const SettingsPage = lazy(() => import("@/features/settings/SettingsPage"));
export const AdminPage = lazy(() => import("@/features/admin/AdminPage"));

/** Starts loading the first-run pages early so the shell and the welcome gate appear together. */
export function preloadEntryPages(): void {
  void loadWelcomePage();
  void loadAuthPage();
}

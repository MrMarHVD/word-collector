/**
 * Route table (contract I1). Paths are the legacy ones; every tab page is
 * lazily loaded from src/features/<name>/<Name>Page.tsx and wrapped in
 * RouteGate. Owned by RX-002; feature issues never edit this file.
 */

import { createBrowserRouter, type RouteObject } from "react-router";
import { RootLayout } from "./RootLayout";
import { HomeRoute, RouteGate } from "./RouteGate";
import { AdminPage, CollectionsPage, DashboardPage, PracticePage, ReaderPage, SettingsPage } from "./pages";
import { RouteError } from "./RouteError";

export const routes: RouteObject[] = [
  {
    element: <RootLayout />,
    errorElement: <RouteError />,
    children: [
      {
        // Pathless boundary: a failing page shows the error inside the app shell.
        errorElement: <RouteError />,
        children: [
          { index: true, element: <HomeRoute /> },
          {
            path: "dashboard",
            element: (
              <RouteGate tab="dashboard">
                <DashboardPage />
              </RouteGate>
            )
          },
          {
            path: "vocab",
            element: (
              <RouteGate tab="collections">
                <CollectionsPage />
              </RouteGate>
            )
          },
          {
            path: "reader",
            element: (
              <RouteGate tab="reader">
                <ReaderPage />
              </RouteGate>
            )
          },
          {
            path: "practice",
            element: (
              <RouteGate tab="practice">
                <PracticePage />
              </RouteGate>
            )
          },
          {
            path: "settings",
            element: (
              <RouteGate tab="settings">
                <SettingsPage />
              </RouteGate>
            )
          },
          {
            path: "admin",
            element: (
              <RouteGate tab="admin">
                <AdminPage />
              </RouteGate>
            )
          },
          { path: "*", element: <HomeRoute /> }
        ]
      }
    ]
  }
];

export const router = createBrowserRouter(routes);

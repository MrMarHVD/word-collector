/** Application entry: arms stale-chunk recovery, applies the theme, starts the session bootstrap and renders the router. */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";
import { bootstrapSession } from "@/app/bootstrap";
import { preloadEntryPages } from "@/app/pages";
import { AppProviders } from "@/app/providers";
import { router } from "@/app/routes";
import { reloadOnStaleChunk } from "@/app/stale-build";
import { startThemeSync } from "@/stores/theme";
import "@/styles/index.css";

reloadOnStaleChunk();
startThemeSync();
preloadEntryPages();
void bootstrapSession();

const root = document.getElementById("root");
if (!root) {
  throw new Error("Missing #root element");
}

createRoot(root).render(
  <StrictMode>
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>
);

/**
 * The /reader route without a work (contract C2): replaces itself with the
 * study language's last-opened work, or with the Library when there is none.
 */

import { useQuery } from "@tanstack/react-query";
import { Navigate } from "react-router";
import { libraryPath, readerPath } from "@/app/route-paths";
import { api, queryKeys } from "@/lib/api";
import { useSessionStore } from "@/stores/session";
import { useStudyLanguageStore } from "@/stores/study-language";
import { pickLastOpenedMaterialId } from "./reader-redirect";
import { readCachedMaterialId } from "./use-reader-material";

/** Resolves /reader to /reader/:id (last opened, else the remembered work) or /library. */
export default function ReaderRedirect() {
  const languageId = useStudyLanguageStore((state) => state.selectedId);
  const userId = useSessionStore((state) => state.user?.id ?? null);
  const { data, isPending } = useQuery({
    queryKey: queryKeys.library.lastOpened(languageId),
    queryFn: async () => (await api.materials.list({ languageId: languageId as number })).materials,
    enabled: languageId !== null,
    // The answer changes whenever a work is opened, so never serve a cached one.
    gcTime: 0,
    retry: false
  });
  if (isPending && languageId !== null) {
    return null;
  }
  // On a failed request `data` is undefined and the remembered work still applies.
  const materialId = pickLastOpenedMaterialId(data ?? [], readCachedMaterialId(userId, languageId));
  return <Navigate to={materialId ? readerPath(materialId) : libraryPath()} replace />;
}

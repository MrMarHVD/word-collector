/**
 * The Library route (/library, contract C2). Placeholder from LIB-002: the
 * category sidebar stub next to the existing material list, whose rows open
 * the work in the Reader at /reader/:id. LIB-003 replaces the contents and
 * keeps the path and default export.
 */

import { useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { libraryPath, parseLibraryAddress, readerPath } from "@/app/route-paths";
import { MaterialList } from "@/features/materials";
import type { LibraryCategory, MaterialListItem } from "@/lib/api/types";
import { useT } from "@/lib/i18n";
import { CategorySidebar } from "./categories/CategorySidebar";

/** The Library route: category selection in the address (?category=), works listed with links into the Reader. */
export default function LibraryPage() {
  const t = useT();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { category, q } = parseLibraryAddress(searchParams);

  const selectCategory = useCallback((next: LibraryCategory) => navigate(libraryPath({ category: next, q })), [navigate, q]);
  // Stable: MaterialList's auto-open of a finished import runs in an effect that depends on it.
  const openMaterial = useCallback(
    (material: MaterialListItem) => {
      if (material.translationStatus && !material.translationStatus.ready) {
        return;
      }
      navigate(readerPath(material.id));
    },
    [navigate]
  );

  return (
    <section id="libraryView" className="grid grid-cols-[200px_minmax(0,1fr)] items-start gap-4 mobile:grid-cols-1">
      <CategorySidebar selected={category} onSelect={selectCategory} />
      <div className="rounded-lg border border-line bg-panel p-5 shadow-panel">
        <h2 className="mb-3 text-xl font-bold">{t("library.title")}</h2>
        <MaterialList selectedMaterialId={null} onOpenMaterial={openMaterial} />
      </div>
    </section>
  );
}

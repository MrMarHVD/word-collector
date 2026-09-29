/**
 * Pure materials logic ported from the legacy materials controller and reader
 * view: row state, import progress, polling and upload validation.
 */

import type { Material, MaterialListItem } from "@/lib/api/types";

/** Beta cap on the number of materials a user may keep (legacy `BETA_MAX_MATERIALS_PER_USER`). */
export const BETA_MAX_MATERIALS_PER_USER = 10;
/** Beta cap on the size of one upload, 50 MB (legacy `BETA_MAX_MATERIAL_UPLOAD_BYTES`). */
export const BETA_MAX_MATERIAL_UPLOAD_BYTES = 50 * 1024 * 1024;
/** Interval of the import/translation polling while any listed material has pending work. */
export const MATERIAL_POLL_INTERVAL_MS = 1500;
/** Debounce of the search field before the list reloads. */
export const MATERIAL_SEARCH_DEBOUNCE_MS = 200;
/** Remaining scroll distance (px) below which the next page loads. */
export const MATERIAL_LOAD_MORE_THRESHOLD_PX = 120;

export type MaterialRowState = "importing" | "failed" | "translating" | "ready";

/** Where a listed material stands; only "ready" materials can be opened. */
export function materialRowState(material: MaterialListItem): MaterialRowState {
  if (material.importStatus === "processing") {
    return "importing";
  }
  if (material.importStatus === "failed") {
    return "failed";
  }
  return material.translationStatus && !material.translationStatus.ready ? "translating" : "ready";
}

/** True while any material is importing or waiting for translations, i.e. while the list must poll. */
export function hasPendingWork(materials: MaterialListItem[]): boolean {
  return materials.some((material) => material.importStatus === "processing" || (material.translationStatus && !material.translationStatus.ready));
}

export interface ImportProgress {
  /** 0–100; 100 when indeterminate (full-width pulsing bar). */
  percent: number;
  /** False before the import knows its word total. */
  determinate: boolean;
}

/** Progress of a processing import from its processed/total word counts. */
export function importProgress(material: Pick<Material, "importTotal" | "importProcessed"> | null | undefined): ImportProgress {
  const total = Number(material?.importTotal || 0);
  const processed = Number(material?.importProcessed || 0);
  if (total > 0) {
    return { percent: Math.min(100, Math.round((processed / total) * 100)), determinate: true };
  }
  return { percent: 100, determinate: false };
}

export type ImportFileError =
  | { key: "reader.chooseFile" }
  | { key: "errors.materialFileTooLarge"; values: { maxMegabytes: string } }
  | { key: "errors.materialLimitReached"; values: { maxDocuments: string } };

/** Client-side upload checks run before POSTing, in the legacy order; null when the upload may proceed. */
export function validateImportFile(file: Pick<File, "size"> | null | undefined, materialCount: number): ImportFileError | null {
  if (!file) {
    return { key: "reader.chooseFile" };
  }
  if (file.size > BETA_MAX_MATERIAL_UPLOAD_BYTES) {
    return { key: "errors.materialFileTooLarge", values: { maxMegabytes: String(Math.round(BETA_MAX_MATERIAL_UPLOAD_BYTES / 1024 / 1024)) } };
  }
  if (materialCount >= BETA_MAX_MATERIALS_PER_USER) {
    return { key: "errors.materialLimitReached", values: { maxDocuments: String(BETA_MAX_MATERIALS_PER_USER) } };
  }
  return null;
}

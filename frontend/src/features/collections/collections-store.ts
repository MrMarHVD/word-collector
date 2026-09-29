import { create } from "zustand";
import type { CollectionSelection } from "./word-list";

interface CollectionsViewState {
  /** Selected collection; kept for the session like the legacy in-memory state, not persisted. */
  selectedCollectionId: CollectionSelection;
  /** Raw search box value; the word list is filtered by its trimmed value. */
  search: string;
  /** Selects a collection and clears the search, as switching collections does. */
  selectCollection: (selection: CollectionSelection) => void;
  setSearch: (search: string) => void;
}

/** Vocab view state that survives tab switches (UI state only; the words live in TanStack Query). */
export const useCollectionsViewStore = create<CollectionsViewState>((set) => ({
  selectedCollectionId: "all",
  search: "",
  selectCollection: (selection) => set({ selectedCollectionId: selection, search: "" }),
  setSearch: (search) => set({ search })
}));

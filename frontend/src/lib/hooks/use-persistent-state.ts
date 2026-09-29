import { useCallback, useState } from "react";
import { readStorage, writeStorage } from "@/lib/storage";

/**
 * React state persisted under a localStorage key, for feature-local
 * preferences (e.g. wordMarkerDashboardStatsTab). `parse` receives the raw
 * stored string (or null) and must return the default for missing/invalid
 * values; `serialize` defaults to String(value), the legacy format.
 */
export function usePersistentState<T>(key: string, parse: (stored: string | null) => T, serialize: (value: T) => string = String): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => parse(readStorage(key)));
  const update = useCallback(
    (next: T) => {
      setValue(next);
      writeStorage(key, serialize(next));
    },
    [key, serialize]
  );
  return [value, update];
}

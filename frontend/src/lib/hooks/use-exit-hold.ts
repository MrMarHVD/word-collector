import { useState } from "react";

/**
 * Keeps the last non-null value around while a popup plays its exit animation.
 * `held` is the value to render (the live one, else the last one until
 * `release()`); call `release()` when the exit animation completes.
 */
export function useExitHold<T>(value: T | null): { held: T | null; release: () => void } {
  const [last, setLast] = useState<T | null>(value);
  if (value !== null && value !== last) {
    setLast(value);
  }
  return { held: value ?? last, release: () => setLast(null) };
}

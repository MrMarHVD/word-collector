/**
 * Safe localStorage access. Every persisted preference goes through these so a
 * blocked or unavailable storage (private mode, quota) never breaks the app.
 * Keys and value formats are the legacy app's (see public/js/state.js).
 */

/** Reads a raw string value, or null when missing or storage is unavailable. */
export function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Writes a raw string value; failures are ignored. */
export function writeStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage unavailable: the preference simply is not persisted.
  }
}

/** Removes a key; failures are ignored. */
export function removeStorage(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Storage unavailable: nothing to remove.
  }
}

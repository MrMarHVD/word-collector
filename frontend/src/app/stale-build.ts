/**
 * Recovery from a stale build: after a deploy, an open tab still references the
 * previous build's hashed chunks, which the server eventually deletes.
 */

const RELOAD_KEY = "wordMarkerChunkReloadAt";
// A second chunk failure within this window is not retried, so a broken build cannot loop.
const RELOAD_WINDOW_MS = 10_000;

/** Reads the last reload time, or 0 when unset or sessionStorage is unavailable. */
function readLastReload(): number {
  try {
    return Number(window.sessionStorage.getItem(RELOAD_KEY)) || 0;
  } catch {
    return 0;
  }
}

/**
 * Reloads the page once when Vite fails to load a lazy chunk ("vite:preloadError"),
 * so the tab picks up the current index.html. A repeated failure is left to the
 * route error screen.
 */
export function reloadOnStaleChunk(): void {
  window.addEventListener("vite:preloadError", (event) => {
    if (Date.now() - readLastReload() < RELOAD_WINDOW_MS) {
      return;
    }
    try {
      window.sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
    } catch {
      // Without sessionStorage the loop guard is unavailable: show the error screen instead.
      return;
    }
    event.preventDefault();
    window.location.reload();
  });
}

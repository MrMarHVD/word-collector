/**
 * @fileoverview Runtime environment bootstrap for the Word Marker frontend.
 *
 * Exposes the backend API base URL as the global `window.WORD_MARKER_API_BASE_URL`.
 * In production/dev the dev server replaces this file with a dynamically generated
 * response that injects the real value; this static fallback ensures the global is
 * always defined (as an empty string, which makes all API calls relative) when the
 * file is served directly from disk without the dev server.
 */

window.WORD_MARKER_API_BASE_URL = window.WORD_MARKER_API_BASE_URL || "";

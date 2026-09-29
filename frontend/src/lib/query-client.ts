import { QueryClient } from "@tanstack/react-query";

/**
 * The app's single QueryClient. Exported as a module singleton so stores and
 * non-React code (logout, 401 handling) can clear or invalidate the cache.
 * Retries are off: the legacy client never retried, and a failed request
 * should surface its localised error immediately.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false },
    mutations: { retry: false }
  }
});

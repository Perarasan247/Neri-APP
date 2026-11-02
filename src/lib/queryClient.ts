import { AppState, Platform } from 'react-native';
import { focusManager, QueryClient } from '@tanstack/react-query';

import { ApiError } from '@/api/client';
import { getOnline } from '@/offline/connectivity';

/** Cached data is kept this long (and written to the device for the same period, see offline/persist.ts). */
const KEEP_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Query defaults tuned for mobile:
 * - retry network/5xx failures with backoff, never 4xx (they won't fix themselves), and don't
 *   retry network errors while we already know we're offline
 * - refetch when the app returns to the foreground
 * - keep data fresh for 30s so tab switches feel instant
 * - networkMode 'always': React Query's own online detection would pause requests; the app tracks
 *   reachability itself (offline/connectivity.ts) so that a failed request is how we find out,
 *   and so offline writes can run their queue-instead logic rather than being paused
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: KEEP_MS,
      networkMode: 'always',
      retry: (count, error) => {
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
        if (error instanceof ApiError && error.isNetwork && !getOnline()) return false;
        return count < 2;
      },
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
      refetchOnWindowFocus: true,
    },
    mutations: {
      networkMode: 'always',
      retry: (count, error) => error instanceof ApiError && error.isNetwork && count < 1,
    },
  },
});

/** Tell React Query when the app is foregrounded (replaces window focus on native). */
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => focusManager.setFocused(state === 'active'));
}

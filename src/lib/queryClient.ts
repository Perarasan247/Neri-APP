import { AppState, Platform } from 'react-native';
import { focusManager, QueryClient } from '@tanstack/react-query';

import { ApiError } from '@/api/client';

/**
 * Query defaults tuned for mobile:
 * - retry network/5xx failures with backoff, never 4xx (they won't fix themselves)
 * - refetch when the app returns to the foreground
 * - keep data fresh for 30s so tab switches feel instant
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      retry: (count, error) => {
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
        return count < 2;
      },
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
      refetchOnWindowFocus: true,
    },
    mutations: {
      retry: (count, error) => error instanceof ApiError && error.isNetwork && count < 1,
    },
  },
});

/** Tell React Query when the app is foregrounded (replaces window focus on native). */
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => focusManager.setFocused(state === 'active'));
}

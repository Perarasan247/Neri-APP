/**
 * Keeps React Query's cache on the device so the app opens with your data when there is no
 * connection. Pure helpers here; the wiring (kv store, query client) is in sync.ts.
 */
import type { DehydratedState } from '@tanstack/react-query';

/** Bump when cached data shapes change so an old cache is discarded instead of misread. */
export const CACHE_VERSION = 1;
export const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const CACHE_MAX_QUERIES = 120;

export interface PersistedCache {
  version: number;
  savedAt: number;
  /** The account the data belongs to. */
  owner: string | null;
  state: DehydratedState;
}

type DehydratedQuery = DehydratedState['queries'][number];

/** The newest `max` successfully loaded queries (insights ranges and calendar pages add up). */
export function selectQueries(queries: DehydratedQuery[], max = CACHE_MAX_QUERIES): DehydratedQuery[] {
  return queries
    .filter((q) => q.state.status === 'success' && q.state.data !== undefined)
    .sort((a, b) => b.state.dataUpdatedAt - a.state.dataUpdatedAt)
    .slice(0, max);
}

/** Parse what was stored; null if it is missing, corrupt, from another version or too old. */
export function parseCache(raw: string | null, now: number): PersistedCache | null {
  if (!raw) return null;
  try {
    const c = JSON.parse(raw) as PersistedCache;
    if (!c || c.version !== CACHE_VERSION || typeof c.savedAt !== 'number') return null;
    if (now - c.savedAt > CACHE_MAX_AGE_MS) return null;
    if (!c.state || !Array.isArray(c.state.queries)) return null;
    return c;
  } catch {
    return null;
  }
}

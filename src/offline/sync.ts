/**
 * Offline sync engine (React Native side). Owns the outbox, replays it when the server is
 * reachable, keeps the query cache on the device, and exposes `sendOrQueue` for mutations.
 * The logic it relies on (outbox, connectivity, persist) is pure and unit tested.
 */
import { AppState } from 'react-native';
import { dehydrate, hydrate, type QueryClient } from '@tanstack/react-query';
import * as Network from 'expo-network';
import KV from 'expo-sqlite/kv-store';

import * as api from '@/api/endpoints';
import { ApiError, isNetworkError, pingServer, setReadGate } from '@/api/client';
import { queryClient } from '@/lib/queryClient';
import {
  getDeviceConnected,
  getOnline,
  msSinceServerFailure,
  setDeviceConnected,
  subscribeOnline,
} from './connectivity';
import { classifyFailure, createOutbox, type FlushResult, type OutboxOp, type Verdict } from './outbox';
import { CACHE_VERSION, parseCache, selectQueries, type PersistedCache } from './persist';

export const outbox = createOutbox(KV);

const CACHE_KEY = 'neri.queryCache.v1';
const PROBE_EVERY_MS = 15_000;
const READ_WAIT_MS = 8_000;
const FAST_FAIL_MS = 4_000;

/* ---------- Who the queued changes belong to ---------- */

let owner: string | null = null;
let cacheOwner: string | null = null;

export const getSyncOwner = () => owner;

/** After an explicit sign-out the saved cache is gone, so nothing in memory belongs to anyone. */
export function forgetCacheOwner() {
  cacheOwner = null;
}

/** Called by the session: the signed-in account (null when signed out). */
export function setSyncOwner(next: string | null) {
  owner = next;
  // The sync screen and banner count this account's changes only. Another account's queued changes
  // are kept untouched on the device until that account signs back in (they are never sent or shown here).
  outbox.setViewer(next);
  if (next) {
    // A cache restored from a different account must never be shown. Reset (not clear): this runs
    // while the new account's first queries are already in flight, and clearing would orphan them.
    if (cacheOwner !== null && cacheOwner !== next) {
      void queryClient.resetQueries();
      void clearPersistedCache();
    }
    cacheOwner = next;
  }
}

/* ---------- Replaying operations ---------- */

function executeOp(op: OutboxOp): Promise<unknown> {
  switch (op.type) {
    case 'upsertLog':
      return api.upsertLog(op.body);
    case 'incrementLog':
      return api.incrementLog(op.body.habit_id, op.body.log_date, op.body.delta);
    case 'addValue':
      return api.addValueEntry(op.body.habit_id, op.body.entry_date, op.body.value, op.body.client_id);
    case 'restDay':
      return op.on ? api.createDaySkip(op.date, op.reason) : api.deleteDaySkip(op.date);
    case 'createTodo':
      return api.createTodo(op.body);
    case 'updateTodo':
      return api.updateTodo(op.id, op.patch, op.scope);
    case 'deleteTodo':
      return api.deleteTodo(op.id, op.scope);
  }
}

/** Decide what a failed replay means (see `Verdict`). */
export function classifyError(error: unknown, op: OutboxOp): Verdict {
  return classifyFailure(error instanceof ApiError ? { status: error.status, isNetwork: error.isNetwork } : null, op);
}

/** Send what is queued for the signed-in account. Refreshes screens once something was sent. */
export async function flushNow(qc: QueryClient = queryClient): Promise<FlushResult | null> {
  const o = owner;
  if (!o || !outbox.hasPending(o)) return null;
  const result = await outbox.flush(o, executeOp, classifyError);
  if (result.sent > 0 || result.failed > 0) qc.invalidateQueries();
  return result;
}

/**
 * Run `send` now, or queue `op` for later when the server can't be reached.
 * - Known offline, or earlier changes are still waiting: queue (keeps order) and return `fallback`.
 * - Otherwise try it; a network failure queues it. A server rejection (4xx) still throws, so
 *   screens show the same error and roll back as before.
 * `op` null means this change can't be queued: it just fails when offline.
 */
export async function sendOrQueue<T>(op: OutboxOp | null, send: () => Promise<T>, fallback: T): Promise<T> {
  const o = owner;
  if (!o) return send();
  if (!op) {
    // Can't be queued (series edits, creating a habit…): but it must not overtake changes still waiting,
    // e.g. editing a task that was created offline. Send what's queued first (bounded wait).
    if (getOnline() && outbox.hasPending(o)) await Promise.race([outbox.flush(o, executeOp, classifyError), sleep(READ_WAIT_MS)]);
    return send();
  }

  if (!getOnline() || outbox.hasPending(o)) {
    await outbox.add(o, op);
    if (getOnline()) void flushNow();
    return fallback;
  }
  try {
    return await send();
  } catch (e) {
    if (!isNetworkError(e)) throw e;
    await outbox.add(o, op);
    return fallback;
  }
}

/* ---------- Cache on the device ---------- */

/** Load the saved cache into React Query. Call once at startup, before any screen reads. */
export async function restoreQueryCache(qc: QueryClient = queryClient, expectedOwner: string | null = null): Promise<void> {
  try {
    const cache = parseCache(await KV.getItem(CACHE_KEY), Date.now());
    if (cache) {
      // Only the saved account's own data may be shown: a cache of someone else (or of nobody known) is dropped
      if (!expectedOwner || cache.owner !== expectedOwner) {
        await clearPersistedCache();
        return;
      }
      hydrate(qc, cache.state);
      cacheOwner = cache.owner;
    }
  } catch {
    // an unreadable cache is just a cold start
  }
}

export async function clearPersistedCache() {
  try {
    await KV.removeItem(CACHE_KEY);
  } catch {}
}

/** Write the cache to the device (debounced) as it changes. Returns a cleanup function. */
function startCachePersistence(qc: QueryClient): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const write = () => {
    if (!owner) return; // signed out: nothing of ours should be kept
    try {
      const state = dehydrate(qc, { shouldDehydrateQuery: (q) => q.state.status === 'success' });
      const cache: PersistedCache = {
        version: CACHE_VERSION,
        savedAt: Date.now(),
        owner,
        state: { ...state, mutations: [], queries: selectQueries(state.queries) },
      };
      void KV.setItem(CACHE_KEY, JSON.stringify(cache)).catch(() => {});
    } catch {}
  };
  const unsub = qc.getQueryCache().subscribe((e) => {
    if (e.type === 'updated' || e.type === 'removed') {
      clearTimeout(timer);
      timer = setTimeout(write, 1500);
    }
  });
  const appSub = AppState.addEventListener('change', (s) => {
    if (s !== 'active') {
      clearTimeout(timer);
      write();
    }
  });
  return () => {
    clearTimeout(timer);
    unsub();
    appSub.remove();
  };
}

/* ---------- Start ---------- */

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Start watching the network, replaying the queue and saving the cache. Returns a cleanup function. */
export function startSync(qc: QueryClient = queryClient): () => void {
  let lastOnline = getOnline();

  // Reads queue up behind queued writes, and bursts of reads fail fast while we know we're offline
  setReadGate(async () => {
    if (!getOnline() && (!getDeviceConnected() || msSinceServerFailure() < FAST_FAIL_MS)) {
      throw new ApiError('You’re offline. Showing what’s saved on this device.', 0, 'network');
    }
    const o = owner;
    if (o && getOnline() && outbox.hasPending(o)) {
      await Promise.race([outbox.flush(o, executeOp, classifyError), sleep(READ_WAIT_MS)]);
    }
  });

  const kick = async () => {
    // While offline, find out whether the server is back; otherwise just send what is waiting
    if (!getOnline() && getDeviceConnected()) await pingServer();
    await flushNow(qc);
  };

  const applyNetwork = (s: Network.NetworkState) => {
    setDeviceConnected(Boolean(s.isConnected) && s.isInternetReachable !== false);
    if (s.isConnected) void kick();
  };
  Network.getNetworkStateAsync().then(applyNetwork).catch(() => {});
  const netSub = Network.addNetworkStateListener(applyNetwork);

  const offSub = subscribeOnline(() => {
    const now = getOnline();
    if (now && !lastOnline) {
      void flushNow(qc);
      qc.invalidateQueries(); // we may have missed changes while away
    }
    lastOnline = now;
  });

  const appSub = AppState.addEventListener('change', (s) => {
    if (s === 'active') void kick();
  });

  const interval = setInterval(() => {
    const o = owner;
    if (!getOnline() || (o && outbox.hasPending(o))) void kick();
  }, PROBE_EVERY_MS);

  const stopCache = startCachePersistence(qc);
  void kick();

  return () => {
    setReadGate(null);
    netSub.remove();
    offSub();
    appSub.remove();
    clearInterval(interval);
    stopCache();
  };
}

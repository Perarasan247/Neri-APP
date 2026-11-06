/**
 * Whether the app can reach its server. Two signals, because "Wi-Fi is on" is not "server is up":
 * - `device`: the phone reports a network connection (expo-network)
 * - `server`: the last request to the server got an answer (any HTTP status counts)
 * `online` needs both. Pure store, no React Native, so it is easy to test.
 */
import { useSyncExternalStore } from 'react';

interface State {
  device: boolean;
  server: boolean;
}

let state: State = { device: true, server: true };
let snapshot = true;
let lastFailureAt = 0;
let everReached = false;
let wakingCount = 0;
let waking = false;
const WAKING_AFTER_MS = 4000;
const listeners = new Set<() => void>();

function set(next: State) {
  if (next.device === state.device && next.server === state.server) return;
  state = next;
  snapshot = state.device && state.server;
  listeners.forEach((l) => l());
}

export const getOnline = () => snapshot;
export const setDeviceConnected = (device: boolean) => set({ ...state, device });
/** Call with true after any HTTP response, false after a network error or timeout. */
export const setServerReachable = (server: boolean) => {
  if (!server) lastFailureAt = Date.now();
  else everReached = true;
  set({ ...state, server });
};
export const getDeviceConnected = () => state.device;
/** Milliseconds since a request last failed to reach the server (Infinity if never). */
export const msSinceServerFailure = () => (lastFailureAt ? Date.now() - lastFailureAt : Infinity);
export const subscribeOnline = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
/** Whether the server has answered at least once since the app started (otherwise it may be asleep). */
export const hasReachedServer = () => everReached;

/**
 * Mark that the very first request is taking long, so the app can say "Server is waking up" instead of
 * "offline". Call with `cold` true for requests made before the server has ever answered; the returned
 * function ends the tracking (call it when the request settles). Only slow requests flip the flag.
 */
export function trackWaking(cold: boolean): () => void {
  if (!cold) return () => {};
  let counted = false;
  const timer = setTimeout(() => {
    counted = true;
    wakingCount++;
    setWaking(wakingCount > 0);
  }, WAKING_AFTER_MS);
  return () => {
    clearTimeout(timer);
    if (counted) {
      counted = false;
      wakingCount = Math.max(0, wakingCount - 1);
      setWaking(wakingCount > 0);
    }
  };
}

function setWaking(next: boolean) {
  if (next === waking) return;
  waking = next;
  listeners.forEach((l) => l());
}

export const getServerWaking = () => waking;

/** Test helper. */
export const resetConnectivity = () => {
  listeners.clear();
  state = { device: true, server: true };
  snapshot = true;
  lastFailureAt = 0;
  everReached = false;
  wakingCount = 0;
  waking = false;
};

export const useServerWaking = () => useSyncExternalStore(subscribeOnline, getServerWaking, getServerWaking);
export const useOnline = () => useSyncExternalStore(subscribeOnline, getOnline, getOnline);

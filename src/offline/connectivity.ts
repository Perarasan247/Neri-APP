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
/** Test helper. */
export const resetConnectivity = () => {
  listeners.clear();
  state = { device: true, server: true };
  snapshot = true;
  lastFailureAt = 0;
};

export const useOnline = () => useSyncExternalStore(subscribeOnline, getOnline, getOnline);

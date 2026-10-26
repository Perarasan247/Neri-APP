import Constants from 'expo-constants';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

/** Port the FastAPI backend listens on (matches frontend/vite.config.ts). */
const DEFAULT_API_PORT = 8000;
const OVERRIDE_KEY = 'neri.apiUrl';
const LEGACY_OVERRIDE_KEY = 'aura.apiUrl';

/**
 * Work out where the backend lives:
 * 1. A URL saved in Settings (handy when switching networks)
 * 2. EXPO_PUBLIC_API_URL from .env
 * 3. In development, the machine running the Expo dev server (same LAN IP)
 * 4. Emulator / simulator loopback as a last resort
 */
function defaultApiUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv.replace(/\/+$/, '');

  const hostUri = Constants.expoConfig?.hostUri; // e.g. "192.168.1.20:8081"
  const host = hostUri?.split(':')[0];
  if (host) return `http://${host}:${DEFAULT_API_PORT}`;

  return Platform.OS === 'android'
    ? `http://10.0.2.2:${DEFAULT_API_PORT}`
    : `http://127.0.0.1:${DEFAULT_API_PORT}`;
}

let apiUrl = defaultApiUrl();

export const config = {
  get apiUrl() {
    return apiUrl;
  },
  defaultApiUrl,
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '',
  /** Request timeout so a dead server never leaves a spinner forever. */
  requestTimeoutMs: 15000,
};

/** Supabase is optional: without keys the backend serves the demo user. */
export const isSupabaseConfigured = Boolean(config.supabaseUrl && config.supabaseKey);

/** Load a URL previously saved from Settings. Call once at startup. */
export async function loadApiUrlOverride(): Promise<void> {
  try {
    const saved = (await AsyncStorage.getItem(OVERRIDE_KEY)) || (await AsyncStorage.getItem(LEGACY_OVERRIDE_KEY));
    if (saved) apiUrl = saved;
  } catch {}
}

/** Save (or clear, with null) the backend URL chosen in Settings. */
export async function setApiUrlOverride(url: string | null): Promise<void> {
  apiUrl = url ? url.replace(/\/+$/, '') : defaultApiUrl();
  try {
    if (url) await AsyncStorage.setItem(OVERRIDE_KEY, apiUrl);
    else await AsyncStorage.removeItem(OVERRIDE_KEY);
  } catch {}
}

import { AppState } from 'react-native';
import { createClient } from '@supabase/supabase-js';

import { config, isSupabaseConfigured } from './config';
import { sessionStorage } from './secureSessionStorage';
import { parseStoredSessionUser, type StoredSessionUser } from './storedSession';

/**
 * Supabase client (see docs.expo.dev/guides/using-supabase). Sessions persist
 * encrypted (see protectedStorage.ts): the AES key is in expo-secure-store and the ciphertext in AsyncStorage. When no keys are configured we still
 * create a client so calls are safe; the backend then serves the demo user.
 */
export const supabase = createClient(
  config.supabaseUrl || 'https://demo.supabase.co',
  config.supabaseKey || 'demo-key',
  {
    auth: {
      storage: sessionStorage,
      autoRefreshToken: isSupabaseConfigured,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);

/** The account in the session saved on this device (works offline, even if its access token expired). */
export async function readStoredSessionUser(): Promise<StoredSessionUser | null> {
  try {
    const key = (supabase.auth as unknown as { storageKey?: string }).storageKey;
    return key ? parseStoredSessionUser(await sessionStorage.getItem(key)) : null;
  } catch {
    return null;
  }
}

/** Remove the saved session from the device (used when signing out could not reach the server). */
export async function clearStoredSession(): Promise<void> {
  try {
    const key = (supabase.auth as unknown as { storageKey?: string }).storageKey;
    if (key) await sessionStorage.removeItem(key);
  } catch {}
}

if (isSupabaseConfigured) {
  // Refresh tokens only while the app is in the foreground
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

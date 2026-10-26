import 'expo-sqlite/localStorage/install';
import { AppState } from 'react-native';
import { createClient } from '@supabase/supabase-js';

import { config, isSupabaseConfigured } from './config';

/**
 * Supabase client (see docs.expo.dev/guides/using-supabase). Sessions persist
 * via the expo-sqlite localStorage shim. When no keys are configured we still
 * create a client so calls are safe; the backend then serves the demo user.
 */
export const supabase = createClient(
  config.supabaseUrl || 'https://demo.supabase.co',
  config.supabaseKey || 'demo-key',
  {
    auth: {
      storage: typeof localStorage !== 'undefined' ? localStorage : undefined,
      autoRefreshToken: isSupabaseConfigured,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);

if (isSupabaseConfigured) {
  // Refresh tokens only while the app is in the foreground
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

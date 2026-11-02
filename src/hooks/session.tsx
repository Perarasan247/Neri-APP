import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isAuthRetryableFetchError } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';

import { setUnauthorizedHandler } from '@/api/client';
import { isSupabaseConfigured } from '@/lib/config';
import { clearPersistedCache, forgetCacheOwner, setSyncOwner } from '@/offline/sync';
import { readStoredSessionUser, supabase } from '@/lib/supabase';

type Status = 'loading' | 'signedOut' | 'signedIn';

interface SessionValue {
  status: Status;
  email: string | null;
  /** Name given at sign-up. */
  name: string | null;
  /** True when running without Supabase (backend serves the demo user). */
  isDemo: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name?: string) => Promise<{ needsConfirmation: boolean }>;
  continueAsDemo: () => Promise<void>;
  signOut: () => Promise<void>;
}

const nameOf = (user?: { user_metadata?: Record<string, any> } | null): string | null =>
  String(user?.user_metadata?.full_name || user?.user_metadata?.name || '').trim() || null;

const DEMO_KEY = 'neri.demoSession';
const LEGACY_DEMO_KEY = 'aura.demoSession';
const LEGACY_EXPIRY_KEY = 'neri.sessionExpiry';
const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<Status>('loading');
  const [email, setEmail] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [isDemo, setIsDemo] = useState(false);

  useEffect(() => {
    let unsub: (() => void) | undefined;

    (async () => {
      // Clear any legacy expiry keys so mobile sessions stay permanently logged in
      await AsyncStorage.removeItem(LEGACY_EXPIRY_KEY).catch(() => {});

      if (isSupabaseConfigured) {
        const { data, error } = await supabase.auth.getSession();
        // Offline with an expired access token Supabase reports "no session" although the account is
        // still saved on the device: open the app on the saved data rather than at the sign-in screen
        const offlineUser = !data.session && error && isAuthRetryableFetchError(error) ? readStoredSessionUser() : null;
        if (data.session) {
          setEmail(data.session.user.email ?? null);
          setName(nameOf(data.session.user));
          setStatus('signedIn');
        } else if (offlineUser) {
          setEmail(offlineUser.email);
          setName(offlineUser.name);
          setStatus('signedIn');
        } else {
          const hasDemo = (await AsyncStorage.getItem(DEMO_KEY)) || (await AsyncStorage.getItem(LEGACY_DEMO_KEY));
          setStatus(hasDemo ? 'signedIn' : 'signedOut');
          setIsDemo(Boolean(hasDemo));
        }
        const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
          if (session) {
            setEmail(session.user.email ?? null);
            setName(nameOf(session.user));
            setIsDemo(false);
            setStatus('signedIn');
          }
        });
        unsub = () => sub.subscription.unsubscribe();
      } else {
        const demo = (await AsyncStorage.getItem(DEMO_KEY).catch(() => null)) || (await AsyncStorage.getItem(LEGACY_DEMO_KEY).catch(() => null));
        setIsDemo(true);
        setStatus(demo ? 'signedIn' : 'signedOut');
      }
    })().catch(() => setStatus('signedOut'));

    return () => unsub?.();
  }, []);

  const signIn = useCallback(async (e: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: e, password });
    if (error) throw error;
  }, []);

  const signUp = useCallback(async (e: string, password: string, fullName?: string) => {
    const { data, error } = await supabase.auth.signUp({
      email: e,
      password,
      options: { data: { full_name: fullName?.trim() ?? '' } },
    });
    if (error) throw error;
    return { needsConfirmation: !data.session };
  }, []);

  const continueAsDemo = useCallback(async () => {
    await AsyncStorage.setItem(DEMO_KEY, '1').catch(() => {});
    setIsDemo(true);
    setEmail('demo@auratracker.app');
    setStatus('signedIn');
  }, []);

  const signOut = useCallback(async () => {
    // Stop saving this account's data first, then wipe what was saved. Queued changes are kept so
    // they are sent when the same account signs back in.
    setSyncOwner(null);
    forgetCacheOwner();
    await clearPersistedCache();
    if (isSupabaseConfigured) await supabase.auth.signOut().catch(() => {});
    await AsyncStorage.removeItem(DEMO_KEY).catch(() => {});
    await AsyncStorage.removeItem(LEGACY_DEMO_KEY).catch(() => {});
    await AsyncStorage.removeItem(LEGACY_EXPIRY_KEY).catch(() => {});
    qc.clear();
    setEmail(null);
    setName(null);
    setStatus('signedOut');
  }, [qc]);

  // Queued offline changes and the saved data cache belong to whoever is signed in
  useEffect(() => {
    setSyncOwner(status === 'signedIn' ? (isDemo ? 'demo' : (email ?? 'unknown')) : null);
  }, [status, isDemo, email]);

  // The server rejected our token (expired or revoked): drop back to the sign-in screen
  useEffect(() => {
    if (isDemo || status !== 'signedIn') return;
    setUnauthorizedHandler(() => {
      signOut();
    });
    return () => setUnauthorizedHandler(null);
  }, [isDemo, status, signOut]);

  const value = useMemo(
    () => ({ status, email, name, isDemo, signIn, signUp, continueAsDemo, signOut }),
    [status, email, name, isDemo, signIn, signUp, continueAsDemo, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>');
  return ctx;
}

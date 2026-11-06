import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isAuthRetryableFetchError } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';

import { setUnauthorizedHandler } from '@/api/client';
import { isSupabaseConfigured, setApiUrlOverride } from '@/lib/config';
import { DEMO_OWNER, ownerKey } from '@/lib/owner';
import { clearPersistedCache, forgetCacheOwner, setSyncOwner } from '@/offline/sync';
import { clearStoredSession, readStoredSessionUser, supabase } from '@/lib/supabase';

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
  const [userId, setUserId] = useState<string | null>(null);
  const [isDemo, setIsDemo] = useState(false);

  /**
   * The account is gone from this device (signed out, or the session was revoked/lapsed): stop saving its
   * data, drop what was saved, and forget a custom server address. Queued changes are kept on purpose,
   * keyed to the account, and sent when the same account signs back in.
   */
  const endLocalSession = useCallback(async () => {
    setSyncOwner(null);
    forgetCacheOwner();
    await clearPersistedCache();
    await setApiUrlOverride(null).catch(() => {});
    qc.clear();
    setEmail(null);
    setName(null);
    setUserId(null);
    setIsDemo(false);
    setStatus('signedOut');
  }, [qc]);

  useEffect(() => {
    let unsub: (() => void) | undefined;

    (async () => {
      // Clear any legacy expiry keys so mobile sessions stay permanently logged in
      await AsyncStorage.removeItem(LEGACY_EXPIRY_KEY).catch(() => {});

      if (isSupabaseConfigured) {
        const { data, error } = await supabase.auth.getSession();
        // Offline with an expired access token Supabase reports "no session" although the account is
        // still saved on the device: open the app on the saved data rather than at the sign-in screen
        const offlineUser = !data.session && error && isAuthRetryableFetchError(error) ? await readStoredSessionUser() : null;
        if (data.session) {
          setEmail(data.session.user.email ?? null);
          setName(nameOf(data.session.user));
          setUserId(data.session.user.id);
          setStatus('signedIn');
        } else if (offlineUser) {
          setEmail(offlineUser.email);
          setName(offlineUser.name);
          setUserId(offlineUser.id);
          setStatus('signedIn');
        } else {
          // A demo flag left over from a build without Supabase must not sign anyone in now
          await Promise.all([AsyncStorage.removeItem(DEMO_KEY), AsyncStorage.removeItem(LEGACY_DEMO_KEY)]).catch(() => {});
          // The session lapsed while the app was closed: nothing of that account's data stays on the device
          forgetCacheOwner();
          await clearPersistedCache();
          setStatus('signedOut');
          setIsDemo(false);
        }
        const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
          if (session) {
            setEmail(session.user.email ?? null);
            setName(nameOf(session.user));
            setUserId(session.user.id);
            setIsDemo(false);
            setStatus('signedIn');
          } else if (event === 'SIGNED_OUT') {
            // Revoked, or ended from another place: the screens must follow (no supabase calls in here)
            void endLocalSession();
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
  }, [endLocalSession]);

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
    await endLocalSession();
    if (isSupabaseConfigured) {
      // Ask the server to end the session; offline that fails and, left alone, the saved session would
      // bring the account straight back on the next launch. So end it on this device regardless.
      const { error } = await supabase.auth.signOut().catch((e: unknown) => ({ error: e }));
      if (error) await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
      await clearStoredSession();
    }
    await AsyncStorage.removeItem(DEMO_KEY).catch(() => {});
    await AsyncStorage.removeItem(LEGACY_DEMO_KEY).catch(() => {});
    await AsyncStorage.removeItem(LEGACY_EXPIRY_KEY).catch(() => {});
  }, [endLocalSession]);

  // Queued offline changes and the saved data cache belong to whoever is signed in
  useEffect(() => {
    setSyncOwner(status === 'signedIn' ? (isDemo ? DEMO_OWNER : ownerKey({ id: userId })) : null);
  }, [status, isDemo, userId]);

  // The server rejected our token and a refresh didn't help (revoked or expired for good): drop back to the sign-in screen
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

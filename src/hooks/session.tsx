import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQueryClient } from '@tanstack/react-query';

import { isSupabaseConfigured } from '@/lib/config';
import { supabase } from '@/lib/supabase';

type Status = 'loading' | 'signedOut' | 'signedIn';

interface SessionValue {
  status: Status;
  email: string | null;
  /** True when running without Supabase (backend serves the demo user). */
  isDemo: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<{ needsConfirmation: boolean }>;
  continueAsDemo: () => Promise<void>;
  signOut: () => Promise<void>;
}

const DEMO_KEY = 'neri.demoSession';
const LEGACY_DEMO_KEY = 'aura.demoSession';
const LEGACY_EXPIRY_KEY = 'neri.sessionExpiry';
const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<Status>('loading');
  const [email, setEmail] = useState<string | null>(null);
  const [isDemo, setIsDemo] = useState(false);

  useEffect(() => {
    let unsub: (() => void) | undefined;

    (async () => {
      // Clear any legacy expiry keys so mobile sessions stay permanently logged in
      await AsyncStorage.removeItem(LEGACY_EXPIRY_KEY).catch(() => {});

      if (isSupabaseConfigured) {
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          setEmail(data.session.user.email ?? null);
          setStatus('signedIn');
        } else {
          const hasDemo = (await AsyncStorage.getItem(DEMO_KEY)) || (await AsyncStorage.getItem(LEGACY_DEMO_KEY));
          setStatus(hasDemo ? 'signedIn' : 'signedOut');
          setIsDemo(Boolean(hasDemo));
        }
        const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
          if (session) {
            setEmail(session.user.email ?? null);
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

  const signUp = useCallback(async (e: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({ email: e, password });
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
    if (isSupabaseConfigured) await supabase.auth.signOut().catch(() => {});
    await AsyncStorage.removeItem(DEMO_KEY).catch(() => {});
    await AsyncStorage.removeItem(LEGACY_DEMO_KEY).catch(() => {});
    await AsyncStorage.removeItem(LEGACY_EXPIRY_KEY).catch(() => {});
    qc.clear();
    setEmail(null);
    setStatus('signedOut');
  }, [qc]);

  const value = useMemo(
    () => ({ status, email, isDemo, signIn, signUp, continueAsDemo, signOut }),
    [status, email, isDemo, signIn, signUp, continueAsDemo, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>');
  return ctx;
}

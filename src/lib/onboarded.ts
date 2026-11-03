/**
 * Remembers, on this device, that an account has finished onboarding (timezone + tracking start date).
 *
 * The server is the source of truth, but if it ever answers "not onboarded" for an account that already
 * was (its database was reset or restored from an older copy), asking the person again would be wrong:
 * the start date is permanent and re-entering it risks a different one. Instead the saved choice is sent
 * back silently. Kept across sign-out on purpose; only the answers are stored, never any habit data.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { ApiError } from '@/api/client';
import * as api from '@/api/endpoints';
import type { Profile } from '@/api/types';
import { isSupabaseConfigured } from '@/lib/config';
import { readStoredSessionUser, supabase } from '@/lib/supabase';

import { parseChoice, type OnboardingChoice } from './onboardedChoice';

const KEY = (user: string) => `neri.onboarded.v1.${user}`;

/** Who is signed in, as a storage key: the account's email, or "demo" without Supabase. Null if unknown. */
async function accountKey(): Promise<string | null> {
  if (!isSupabaseConfigured) return 'demo';
  try {
    const { data } = await supabase.auth.getSession();
    const email = data.session?.user.email ?? readStoredSessionUser()?.email ?? null;
    return email ? email.trim().toLowerCase() : null;
  } catch {
    return readStoredSessionUser()?.email?.trim().toLowerCase() ?? null;
  }
}

export async function rememberOnboarded(profile: Pick<Profile, 'timezone' | 'tracking_start_date'>): Promise<void> {
  try {
    const key = await accountKey();
    if (!key) return;
    const choice: OnboardingChoice = { timezone: profile.timezone, trackingStartDate: profile.tracking_start_date };
    await AsyncStorage.setItem(KEY(key), JSON.stringify(choice));
  } catch {}
}

async function recall(): Promise<OnboardingChoice | null> {
  try {
    const key = await accountKey();
    return key ? parseChoice(await AsyncStorage.getItem(KEY(key))) : null;
  } catch {
    return null;
  }
}

/**
 * The signed-in account's profile, or null when it genuinely has to onboard (a new account).
 * Never null for an account that onboarded before: a missing server profile is restored from the saved choice.
 */
export async function loadProfile(): Promise<Profile | null> {
  const profile = await api.getProfile();
  if (profile) {
    await rememberOnboarded(profile);
    return profile;
  }

  const saved = await recall();
  if (!saved) return null; // first time for this account on this device (and the server has none either)

  try {
    return await api.submitOnboarding(saved.trackingStartDate, saved.timezone);
  } catch (e) {
    // Only a definite "these answers are invalid" falls back to asking. Offline, a timeout or a server
    // error is surfaced so the app offers a retry: the form would ask again for something already answered.
    if (e instanceof ApiError && !e.isNetwork && e.status >= 400 && e.status < 500 && ![401, 403, 408, 429].includes(e.status)) {
      return null;
    }
    throw e;
  }
}

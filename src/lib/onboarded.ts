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
import { DEMO_OWNER, ownerKey } from '@/lib/owner';
import { readStoredSessionUser, supabase } from '@/lib/supabase';

import { parseChoice, type OnboardingChoice } from './onboardedChoice';

const KEY = (user: string) => `neri.onboarded.v1.${user}`;

/** Keys of the same answers before accounts were told apart by id (the account's email). */
const LEGACY_KEY = (email: string) => `neri.onboarded.v1.${email}`;

/**
 * Who is signed in, as storage keys: the account's id (never a shared fallback), plus the email the answers
 * used to be saved under. Null if unknown. Without Supabase there is only the demo user.
 */
async function accountKeys(): Promise<{ id: string; legacyEmail: string | null } | null> {
  if (!isSupabaseConfigured) return { id: DEMO_OWNER, legacyEmail: null };
  try {
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user ?? (await readStoredSessionUser());
    const id = user && 'id' in user ? user.id : null;
    const email = user?.email ?? null;
    const key = ownerKey({ id });
    return key ? { id: key, legacyEmail: email ? email.trim().toLowerCase() : null } : null;
  } catch {
    const user = await readStoredSessionUser();
    const key = ownerKey(user);
    return key ? { id: key, legacyEmail: user?.email?.trim().toLowerCase() ?? null } : null;
  }
}

export async function rememberOnboarded(profile: Pick<Profile, 'timezone' | 'tracking_start_date'>): Promise<void> {
  try {
    const who = await accountKeys();
    if (!who) return;
    const choice: OnboardingChoice = { timezone: profile.timezone, trackingStartDate: profile.tracking_start_date };
    await AsyncStorage.setItem(KEY(who.id), JSON.stringify(choice));
  } catch {}
}

async function recall(): Promise<OnboardingChoice | null> {
  try {
    const who = await accountKeys();
    if (!who) return null;
    const byId = parseChoice(await AsyncStorage.getItem(KEY(who.id)));
    if (byId || !who.legacyEmail) return byId;
    // Saved before accounts were keyed by id: carry it over once
    const byEmail = parseChoice(await AsyncStorage.getItem(LEGACY_KEY(who.legacyEmail)));
    if (byEmail) {
      await AsyncStorage.setItem(KEY(who.id), JSON.stringify(byEmail));
      await AsyncStorage.removeItem(LEGACY_KEY(who.legacyEmail));
    }
    return byEmail;
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

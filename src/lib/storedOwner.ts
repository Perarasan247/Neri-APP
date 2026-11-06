import { isSupabaseConfigured } from './config';
import { DEMO_OWNER, ownerKey } from './owner';
import { readStoredSessionUser } from './supabase';

/**
 * Who the device's saved session belongs to (readable offline, before the app has signed in), as an owner
 * key. Used to decide whether saved data and queued changes belong to the person about to use the app.
 * Null when nobody is signed in.
 */
export async function readStoredOwner(): Promise<string | null> {
  if (!isSupabaseConfigured) return DEMO_OWNER;
  return ownerKey(await readStoredSessionUser());
}

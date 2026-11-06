/**
 * Read who is signed in from the session Supabase keeps on the device. Used when the app starts
 * offline with an expired access token: Supabase can't refresh it, but the account is still the
 * same and the refresh token is still stored, so the app opens in offline mode instead of asking
 * for a password it can't verify.
 */
export interface StoredSessionUser {
  /** The account's id: what queued changes and cached data are keyed by. */
  id: string | null;
  email: string | null;
  name: string | null;
}

export function parseStoredSessionUser(raw: string | null | undefined): StoredSessionUser | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw);
    // Needs a refresh token, otherwise there is nothing that could ever sign in again
    if (!s || typeof s !== 'object' || typeof s.refresh_token !== 'string' || !s.refresh_token) return null;
    const user = s.user;
    if (!user || typeof user !== 'object') return null;
    const name = String(user.user_metadata?.full_name || user.user_metadata?.name || '').trim() || null;
    return { id: typeof user.id === 'string' && user.id ? user.id : null, email: typeof user.email === 'string' ? user.email : null, name };
  } catch {
    return null;
  }
}

/**
 * Who queued changes and cached data belong to. The account's id (never its email, which can change,
 * and never a shared fallback such as "unknown"), or "demo" when running without Supabase.
 * Null means nobody is known, and then nothing is saved for later.
 */
export const DEMO_OWNER = 'demo';

export function ownerKey(user: { id?: string | null } | null | undefined, isDemo = false): string | null {
  if (isDemo) return DEMO_OWNER;
  const id = user?.id?.trim();
  return id ? `u:${id}` : null;
}

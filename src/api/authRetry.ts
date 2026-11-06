/**
 * One expired access token must not sign the person out. On a 401 we try to refresh the session and
 * repeat the request once; only a refresh the server definitely refuses counts as "signed out".
 * Pure so it is unit tested; the Supabase refresh is injected.
 */

/** What refreshing the session came to. */
export type RefreshOutcome =
  | 'refreshed' // got a new token
  | 'rejected' // the server refused the refresh token: the session is really over
  | 'unreachable'; // couldn't find out (offline, timeout): keep the session

export interface AuthedResult<R> {
  result: R;
  /** True when the server still refused us after a refresh, or the refresh was refused. */
  unauthorized: boolean;
}

export async function withAuthRefresh<R extends { status: number }>(
  run: () => Promise<R>,
  refresh: () => Promise<RefreshOutcome>,
  onUnreachable: () => Error,
): Promise<AuthedResult<R>> {
  const first = await run();
  if (first.status !== 401) return { result: first, unauthorized: false };

  const outcome = await refresh();
  if (outcome === 'unreachable') throw onUnreachable();
  if (outcome === 'rejected') return { result: first, unauthorized: true };

  const second = await run();
  return { result: second, unauthorized: second.status === 401 };
}

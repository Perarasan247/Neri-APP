import { config, IS_DEV, isSupabaseConfigured } from '@/lib/config';
import { isAllowedServerUrl } from '@/lib/serverUrl';
import { isAuthApiError, isAuthRetryableFetchError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { hasReachedServer, setServerReachable, trackWaking } from '@/offline/connectivity';

import { withAuthRefresh, type RefreshOutcome } from './authRetry';

/** Error carrying the HTTP status so callers can branch on 401 / 404 / network. */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public kind: 'http' | 'network' | 'timeout' = 'http',
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isNetwork() {
    return this.kind !== 'http';
  }
}

type UnauthorizedListener = () => void;
let onUnauthorized: UnauthorizedListener | null = null;
/** Registered by the session provider: called when the server rejects our token (HTTP 401). */
export function setUnauthorizedHandler(fn: UnauthorizedListener | null) {
  onUnauthorized = fn;
}

type ReadGate = () => Promise<void>;
let beforeRead: ReadGate | null = null;
/**
 * Registered by the sync engine: reads wait here while queued offline changes are being sent, so a
 * refetch never lands before them and overwrites what the user just did with stale server data.
 */
export function setReadGate(fn: ReadGate | null) {
  beforeRead = fn;
}

/** A failure to reach the server at all (offline, DNS, timeout), as opposed to the server saying no. */
export const isNetworkError = (e: unknown): e is ApiError => e instanceof ApiError && e.isNetwork;

/** FastAPI sends `detail` as a string, or as a list of {loc, msg} for validation errors. */
function detailText(detail: unknown): string | null {
  if (typeof detail === 'string') return detail.trim() || null;
  if (Array.isArray(detail)) {
    const parts = detail
      .map((d: any) => {
        const msg = typeof d?.msg === 'string' ? d.msg.replace(/^Value error, /, '') : '';
        const field = Array.isArray(d?.loc) ? String(d.loc[d.loc.length - 1] ?? '') : '';
        return msg && field && field !== 'body' ? `${field.replace(/_/g, ' ')}: ${msg}` : msg;
      })
      .filter(Boolean);
    return parts.length ? parts.join('. ') : null;
  }
  return null;
}

/** Turn an HTTP failure into something a person can act on. */
function messageForStatus(status: number, detail: unknown): string {
  const text = detailText(detail);
  if (status === 401) return 'Your session has expired. Please sign in again.';
  if (status === 403) return text || 'You don’t have permission to do that.';
  if (status === 404) return text || 'We couldn’t find that. It may have been deleted.';
  if (status === 408) return 'The request timed out. Please try again.';
  if (status === 409) return text || 'That conflicts with something that already exists.';
  if (status === 400 || status === 422) return text || 'Some of the details aren’t valid. Please check them and try again.';
  if (status === 429) return 'Too many requests. Please wait a moment and try again.';
  if (status === 502 || status === 503 || status === 504) return 'The server is temporarily unavailable. Please try again in a moment.';
  if (status >= 500) return 'Something went wrong on our side. Please try again.';
  return text || `Request failed (${status}).`;
}

async function authHeaders(): Promise<Record<string, string>> {
  if (!isSupabaseConfigured) return {};
  try {
    const { data, error } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) return { Authorization: `Bearer ${token}` };
    // Expired token that couldn't be refreshed because we're offline: the session still exists, so
    // don't send an unauthenticated request (the server would answer 401 and we'd sign the user out)
    if (error && isAuthRetryableFetchError(error)) {
      throw new ApiError('Your session can’t be refreshed while you’re offline.', 0, 'network');
    }
    return {};
  } catch (e) {
    if (e instanceof ApiError) throw e;
    return {};
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;

function buildUrl(path: string, query?: Query): string {
  const qs = query
    ? Object.entries(query)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&')
    : '';
  return `${config.apiUrl}/api${path}${qs ? `?${qs}` : ''}`;
}

/** One HTTP round trip: base URL, auth, timeout; reports whether the server answered. */
async function send(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  opts: { query?: Query; body?: unknown; accept?: string; timeoutMs?: number },
): Promise<{ res: Response; text: string; status: number }> {
  // The login token goes to this host: never over plain http outside development / a private network
  if (!isAllowedServerUrl(config.apiUrl, IS_DEV)) {
    throw new ApiError('The server address must use https. Change it in Settings.', 0, 'network');
  }
  // Before the server has answered once it may be asleep (a cold start takes up to a minute)
  const coldStart = !hasReachedServer();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? (coldStart ? config.coldStartTimeoutMs : config.requestTimeoutMs));
  const stopWaking = trackWaking(coldStart);

  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.query), {
      method,
      signal: controller.signal,
      headers: {
        Accept: opts.accept ?? 'application/json',
        ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(await authHeaders()),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch (e: any) {
    const timedOut = e?.name === 'AbortError';
    setServerReachable(false);
    throw new ApiError(
      timedOut
        ? 'The server took too long to respond.'
        : `Can't reach the server at ${config.apiUrl}. Check your connection or the server address in Settings.`,
      0,
      timedOut ? 'timeout' : 'network',
    );
  } finally {
    clearTimeout(timer);
    stopWaking();
  }

  // Any HTTP answer (even an error) proves the server is up
  setServerReachable(true);
  return { res, text: await res.text(), status: res.status };
}

let refreshing: Promise<RefreshOutcome> | null = null;

/** Refresh the Supabase session once, however many requests found their token expired at the same time. */
function refreshSession(): Promise<RefreshOutcome> {
  if (!isSupabaseConfigured) return Promise.resolve('rejected');
  return (refreshing ??= (async (): Promise<RefreshOutcome> => {
    try {
      const { data, error } = await supabase.auth.refreshSession();
      if (data.session) return 'refreshed';
      // Only a definite refusal ends the session; anything we can't tell (offline, timeout) keeps it
      return error && isAuthApiError(error) ? 'rejected' : 'unreachable';
    } catch {
      return 'unreachable';
    }
  })().finally(() => {
    refreshing = null;
  }));
}

/** `send`, but an expired token is refreshed and the request repeated once before giving up on the session. */
async function sendAuthed(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  opts: { query?: Query; body?: unknown; accept?: string; timeoutMs?: number },
) {
  const { result, unauthorized } = await withAuthRefresh(
    () => send(method, path, opts),
    refreshSession,
    () => new ApiError('Your session can’t be refreshed right now. Check your connection.', 0, 'network'),
  );
  return { ...result, unauthorized };
}

function parseJson(text: string): any {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function failure(res: Response, data: any, unauthorized: boolean): ApiError {
  // Only after a refresh failed too: one rejected token is not the end of the session
  if (res.status === 401 && unauthorized) onUnauthorized?.();
  return new ApiError(messageForStatus(res.status, data?.detail), res.status);
}

/**
 * Typed fetch wrapper: base URL, auth, JSON, timeout and uniform errors.
 * FastAPI puts error messages in `detail`; we surface that text.
 */
export async function request<T>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  opts: { query?: Query; body?: unknown; timeoutMs?: number } = {},
): Promise<T> {
  if (method === 'GET' && beforeRead) await beforeRead();

  const { res, text, unauthorized } = await sendAuthed(method, path, opts);
  const data = parseJson(text);

  if (!res.ok) throw failure(res, data, unauthorized);

  // 2xx but not JSON: usually a wrong server address answering with a web page
  if (text && typeof data === 'string') {
    throw new ApiError('The server sent a reply we couldn’t read. Check the server address in Settings.', res.status);
  }

  return data as T;
}

/** GET that returns the body as text (file exports). Not gated: it is a deliberate user action. */
export async function requestText(path: string, query?: Query, timeoutMs?: number): Promise<string> {
  const { res, text, unauthorized } = await sendAuthed('GET', path, { query, accept: '*/*', timeoutMs });
  if (!res.ok) throw failure(res, parseJson(text), unauthorized);
  return text;
}

/** Cheap "is the server up?" check against the root endpoint (no auth, never throws). */
export async function pingServer(timeoutMs?: number): Promise<boolean> {
  if (!isAllowedServerUrl(config.apiUrl, IS_DEV)) return false;
  const coldStart = !hasReachedServer();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs ?? (coldStart ? config.coldStartTimeoutMs : 5000));
  const stopWaking = trackWaking(coldStart);
  try {
    const res = await fetch(`${config.apiUrl}/`, { signal: controller.signal, headers: { Accept: 'application/json' } });
    setServerReachable(true);
    return res.status < 500;
  } catch {
    setServerReachable(false);
    return false;
  } finally {
    clearTimeout(timer);
    stopWaking();
  }
}

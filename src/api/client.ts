import { config, isSupabaseConfigured } from '@/lib/config';
import { supabase } from '@/lib/supabase';

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

async function authHeaders(): Promise<Record<string, string>> {
  if (!isSupabaseConfigured) return {};
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
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

/**
 * Typed fetch wrapper: base URL, auth, JSON, timeout and uniform errors.
 * FastAPI puts error messages in `detail`; we surface that text.
 */
export async function request<T>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  opts: { query?: Query; body?: unknown } = {},
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.requestTimeoutMs);

  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.query), {
      method,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(await authHeaders()),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch (e: any) {
    const timedOut = e?.name === 'AbortError';
    throw new ApiError(
      timedOut
        ? 'The server took too long to respond.'
        : `Can't reach the server at ${config.apiUrl}. Check your connection or the server address in Settings.`,
      0,
      timedOut ? 'timeout' : 'network',
    );
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  let data: any = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    const detail = data?.detail;
    const message =
      typeof detail === 'string'
        ? detail
        : Array.isArray(detail)
          ? detail.map((d: any) => d?.msg).filter(Boolean).join(', ')
          : res.statusText || `Request failed (${res.status})`;
    throw new ApiError(message, res.status);
  }

  return data as T;
}

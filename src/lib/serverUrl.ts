/**
 * Rules for the backend address (Settings → Server). The sign-in token is sent to this host with every
 * request, so a release build only talks to it over https; plain http is for development and for a
 * backend on the same private network.
 */

export type ServerUrlCheck = { ok: true; url: string; secure: boolean } | { ok: false; reason: string };

/** localhost, loopback, the Android emulator's host alias, RFC 1918 ranges, link-local and *.local names. */
export function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h === '::1' || h.endsWith('.local') || h.endsWith('.localhost')) return true;
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return (
    a === 127 ||
    a === 10 ||
    (a === 192 && b === 168) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 169 && b === 254)
  );
}

const URL_PATTERN = /^(https?):\/\/([^\s/:?#@\\]+|\[[0-9a-f:]+\])(?::(\d{1,5}))?(\/[^\s?#]*)?$/i;

/** Validate and normalise (no trailing slash) a server address. `isDev` allows any http address. */
export function checkServerUrl(input: string, isDev = false): ServerUrlCheck {
  const text = input.trim();
  const m = text.match(URL_PATTERN);
  if (!m) return { ok: false, reason: 'Enter a full URL, e.g. https://api.example.com' };
  const [, scheme, host, port] = m;
  if (port !== undefined && Number(port) > 65535) return { ok: false, reason: 'That port number is not valid.' };
  const secure = scheme.toLowerCase() === 'https';
  if (!secure && !isDev && !isPrivateHost(host)) {
    return { ok: false, reason: 'Use https:// — plain http is only allowed for a server on your own network.' };
  }
  return { ok: true, url: text.replace(/\/+$/, ''), secure };
}

/** Whether requests carrying the login token may go to this address. */
export const isAllowedServerUrl = (url: string, isDev = false): boolean => checkServerUrl(url, isDev).ok;

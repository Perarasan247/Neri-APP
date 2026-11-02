/** Friendlier wording for Supabase auth failures (sign in, sign up, reset). */
export function authErrorMessage(err: unknown, fallback = 'Authentication failed. Please try again.'): string {
  const raw = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  const m = raw.toLowerCase();
  if (!m) return fallback;
  if (m.includes('invalid login credentials')) return 'That email and password don’t match. Check them and try again.';
  if (m.includes('email not confirmed')) return 'Please confirm your email first. Check your inbox for the link we sent.';
  if (m.includes('user already registered') || m.includes('already been registered'))
    return 'An account with this email already exists. Try logging in instead.';
  if (m.includes('password should be at least') || m.includes('weak password'))
    return 'That password is too weak. Use at least 6 characters.';
  if (m.includes('unable to validate email') || m.includes('invalid email') || m.includes('is invalid'))
    return 'That email address doesn’t look right.';
  if (m.includes('rate limit') || m.includes('too many') || m.includes('security purposes'))
    return 'Too many attempts. Please wait a minute and try again.';
  if (m.includes('signups not allowed') || m.includes('signup is disabled')) return 'New sign-ups are turned off right now.';
  if (m.includes('network request failed') || m.includes('failed to fetch') || m.includes('network') || m.includes('timed out'))
    return 'Can’t reach the sign-in service. Check your internet connection and try again.';
  if (m.includes('jwt') || m.includes('refresh token') || m.includes('session'))
    return 'Your session has expired. Please sign in again.';
  return raw;
}

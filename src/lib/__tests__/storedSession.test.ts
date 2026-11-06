import { parseStoredSessionUser } from '../storedSession';

const session = (over: object = {}) =>
  JSON.stringify({
    access_token: 'a',
    refresh_token: 'r',
    expires_at: 1,
    user: { id: 'u', email: 'a@b.co', user_metadata: { full_name: ' Asha ' } },
    ...over,
  });

describe('parseStoredSessionUser', () => {
  it('reads the email and name of a stored session, even an expired one', () => {
    expect(parseStoredSessionUser(session())).toEqual({ id: 'u', email: 'a@b.co', name: 'Asha' });
  });
  it('falls back to the metadata "name" and tolerates a missing email', () => {
    expect(parseStoredSessionUser(session({ user: { id: 'u', user_metadata: { name: 'Ravi' } } }))).toEqual({ id: 'u', email: null, name: 'Ravi' });
  });
  it('refuses anything that could not sign in again', () => {
    expect(parseStoredSessionUser(null)).toBeNull();
    expect(parseStoredSessionUser('')).toBeNull();
    expect(parseStoredSessionUser('{nope')).toBeNull();
    expect(parseStoredSessionUser('"str"')).toBeNull();
    expect(parseStoredSessionUser(session({ refresh_token: '' }))).toBeNull();
    expect(parseStoredSessionUser(session({ refresh_token: undefined }))).toBeNull();
    expect(parseStoredSessionUser(session({ user: null }))).toBeNull();
  });
});

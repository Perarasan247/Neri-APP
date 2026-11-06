import { checkServerUrl, isAllowedServerUrl, isPrivateHost } from '../serverUrl';

describe('server address rules', () => {
  it('accepts https anywhere and normalises the trailing slash', () => {
    expect(checkServerUrl('https://api.example.com/', false)).toEqual({ ok: true, url: 'https://api.example.com', secure: true });
    expect(checkServerUrl(' https://api.example.com:8443/v1 ', false)).toMatchObject({ ok: true, url: 'https://api.example.com:8443/v1' });
  });

  it('refuses http to a public host in a release build', () => {
    const r = checkServerUrl('http://api.example.com', false);
    expect(r.ok).toBe(false);
    expect(isAllowedServerUrl('http://203.0.113.9:8000', false)).toBe(false);
  });

  it('allows http for a private network or in development', () => {
    expect(isAllowedServerUrl('http://192.168.1.20:8000', false)).toBe(true);
    expect(isAllowedServerUrl('http://10.0.2.2:8000', false)).toBe(true);
    expect(isAllowedServerUrl('http://172.20.0.5', false)).toBe(true);
    expect(isAllowedServerUrl('http://my-mac.local:8000', false)).toBe(true);
    expect(isAllowedServerUrl('http://api.example.com', true)).toBe(true);
  });

  it('does not treat look-alikes as private', () => {
    expect(isPrivateHost('172.32.0.1')).toBe(false);
    expect(isPrivateHost('192.169.1.1')).toBe(false);
    expect(isPrivateHost('10.0.0.1.evil.com')).toBe(false);
    expect(isPrivateHost('localhost.evil.com')).toBe(false);
  });

  it('rejects malformed input, credentials and bad ports', () => {
    for (const bad of ['', 'api.example.com', 'ftp://x.com', 'https://', 'https://user:pw@evil.com', 'https://x.com:99999', 'https://a b.com', 'https://x.com?q=1']) {
      expect(checkServerUrl(bad, true).ok).toBe(false);
    }
  });
});

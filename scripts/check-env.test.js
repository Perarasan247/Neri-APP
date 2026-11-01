const { spawnSync } = require('node:child_process');
const path = require('node:path');

const SCRIPT = path.join(__dirname, 'check-env.js');
const GOOD = {
  EXPO_PUBLIC_SUPABASE_URL: 'https://x.supabase.co',
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_abc',
  EXPO_PUBLIC_API_URL: 'https://api.example.com',
};

const run = (env) =>
  spawnSync(process.execPath, [SCRIPT], {
    env: { PATH: process.env.PATH, ...env },
    encoding: 'utf8',
  });

describe('check-env build guard', () => {
  it('passes with every value set', () => {
    expect(run({ EAS_BUILD: 'true', EAS_BUILD_PROFILE: 'production', ...GOOD }).status).toBe(0);
  });

  it('fails a cloud build that is missing the Supabase keys', () => {
    const r = run({ EAS_BUILD: 'true', EAS_BUILD_PROFILE: 'production', EXPO_PUBLIC_API_URL: GOOD.EXPO_PUBLIC_API_URL });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('EXPO_PUBLIC_SUPABASE_URL is not set');
  });

  it('fails a cloud build that points at a LAN address', () => {
    const r = run({ EAS_BUILD: 'true', EAS_BUILD_PROFILE: 'production', ...GOOD, EXPO_PUBLIC_API_URL: 'http://192.168.1.20:8000' });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('local address');
  });

  it('refuses a service-role key in the client bundle', () => {
    const jwt = ['h', Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url'), 's'].join('.');
    const r = run({ EAS_BUILD: 'true', EAS_BUILD_PROFILE: 'production', ...GOOD, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: jwt });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('service_role');
  });

  it('skips dev-client builds and only warns on a local run', () => {
    expect(run({ EAS_BUILD: 'true', EAS_BUILD_PROFILE: 'development' }).status).toBe(0);
    expect(run({}).status).toBe(0);
  });
});

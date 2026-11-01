#!/usr/bin/env node
/**
 * Fails an EAS build that would ship without sign-in or without a reachable backend.
 *
 * EXPO_PUBLIC_* values are baked into the app at build time, and `.env` is gitignored,
 * so a cloud build only sees what is set in EAS (`eas env:list --environment production`).
 * Without the Supabase keys the sign-in screen has no email/password fields; without
 * EXPO_PUBLIC_API_URL the installed app points at a LAN or emulator address.
 *
 * Runs as the `eas-build-pre-install` hook. Locally: `npm run check:env`.
 */
const profile = process.env.EAS_BUILD_PROFILE;
const isEasBuild = Boolean(process.env.EAS_BUILD);

// Dev-client builds talk to the machine running `expo start`; nothing to enforce.
if (profile === 'development') process.exit(0);

const required = ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'EXPO_PUBLIC_API_URL'];
const problems = [];

for (const name of required) {
  if (!(process.env[name] || '').trim()) problems.push(`${name} is not set`);
}

const api = (process.env.EXPO_PUBLIC_API_URL || '').trim();
if (api) {
  if (!/^https?:\/\//i.test(api)) problems.push('EXPO_PUBLIC_API_URL must start with http:// or https://');
  else if (/^https?:\/\/(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(api)) {
    problems.push(`EXPO_PUBLIC_API_URL (${api}) is a local address; an installed app can't reach it`);
  }
}

// A service-role key must never be bundled into a client app
const key = (process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '').trim();
if (key.split('.').length === 3) {
  try {
    const role = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role;
    if (role && role !== 'anon') problems.push(`EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY has role "${role}"; use the publishable/anon key`);
  } catch {
    /* not a JWT we can read; leave it to Supabase */
  }
}

if (problems.length) {
  console.error(`\nBuild config problem${profile ? ` (profile "${profile}")` : ''}:`);
  for (const p of problems) console.error(`  - ${p}`);
  console.error(
    '\nSet them for the build environment, e.g.\n' +
      '  npx eas-cli env:create --environment production --name EXPO_PUBLIC_SUPABASE_URL --value "..." --visibility plaintext\n' +
      'then check with: npx eas-cli env:list --environment production\n',
  );
  // Locally this is advisory (a dev may run without Supabase on purpose); in the cloud it is fatal
  process.exit(isEasBuild ? 1 : 0);
}

console.log('Build config OK: Supabase keys and API URL are set.');

import { randomBytes } from 'crypto';

import { createAesCipher } from '../aesCipher';
import { createProtectedStorage, ENCRYPTED_PREFIX, secretName, type AsyncKV, type SecretStore } from '../protectedStorage';
import { ownerKey } from '../owner';

const cipher = createAesCipher((n) => new Uint8Array(randomBytes(n)));

function memoryKV(): AsyncKV & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: async (k) => map.get(k) ?? null,
    setItem: async (k, v) => void map.set(k, v),
    removeItem: async (k) => void map.delete(k),
  };
}

function memorySecrets(available = true): SecretStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    isAvailable: async () => available,
    get: async (k) => map.get(k) ?? null,
    set: async (k, v) => void map.set(k, v),
    remove: async (k) => void map.delete(k),
  };
}

function legacyStore(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return { map, getItem: (k: string) => map.get(k) ?? null, removeItem: (k: string) => void map.delete(k) };
}

const SESSION = JSON.stringify({ access_token: 'a.b.c', refresh_token: 'r', user: { id: 'u1', email: 'x@y.co' } });

describe('aes cipher', () => {
  it('round-trips text, including unicode', () => {
    const key = cipher.newKey();
    expect(key).toHaveLength(64);
    const text = '{"name":"Zoë ✓"}';
    expect(cipher.decrypt(key, cipher.encrypt(key, text))).toBe(text);
  });
  it('uses a new IV each time, so equal inputs give different ciphertext', () => {
    const key = cipher.newKey();
    expect(cipher.encrypt(key, 'same')).not.toBe(cipher.encrypt(key, 'same'));
  });
  it('rejects text that is not ciphertext', () => {
    expect(() => cipher.decrypt(cipher.newKey(), '{"plain":1}')).toThrow();
  });
});

describe('protected session storage', () => {
  it('stores ciphertext in the data store and the key in the secret store', async () => {
    const data = memoryKV();
    const secrets = memorySecrets();
    const s = createProtectedStorage({ secrets, data, cipher });
    await s.setItem('sb-token', SESSION);

    const stored = data.map.get('sb-token')!;
    expect(stored.startsWith(ENCRYPTED_PREFIX)).toBe(true);
    expect(stored).not.toContain('refresh_token');
    expect(stored).not.toContain('a.b.c');
    expect(secrets.map.get(secretName('sb-token'))).toHaveLength(64);
    expect(await s.getItem('sb-token')).toBe(SESSION);
  });

  it('migrates a plain legacy session without signing the user out, then removes the plain copy', async () => {
    const data = memoryKV();
    const old = legacyStore({ 'sb-token': SESSION });
    const s = createProtectedStorage({ secrets: memorySecrets(), data, cipher, legacy: old });

    expect(await s.getItem('sb-token')).toBe(SESSION);
    expect(old.map.has('sb-token')).toBe(false);
    expect(data.map.get('sb-token')!.startsWith(ENCRYPTED_PREFIX)).toBe(true);
    // and it is still readable afterwards
    expect(await s.getItem('sb-token')).toBe(SESSION);
  });

  it('keeps the legacy copy when the migrated write fails', async () => {
    const data = memoryKV();
    data.setItem = async () => {
      throw new Error('disk full');
    };
    const old = legacyStore({ 'sb-token': SESSION });
    const s = createProtectedStorage({ secrets: memorySecrets(), data, cipher, legacy: old });
    expect(await s.getItem('sb-token')).toBe(SESSION);
    expect(old.map.has('sb-token')).toBe(true);
  });

  it('falls back to plain storage when SecureStore is unavailable, and upgrades later', async () => {
    const data = memoryKV();
    const unavailable = memorySecrets(false);
    await createProtectedStorage({ secrets: unavailable, data, cipher }).setItem('k', SESSION);
    expect(data.map.get('k')).toBe(SESSION);

    const working = memorySecrets(true);
    const s = createProtectedStorage({ secrets: working, data, cipher });
    expect(await s.getItem('k')).toBe(SESSION);
    expect(data.map.get('k')!.startsWith(ENCRYPTED_PREFIX)).toBe(true);
  });

  it('does not throw when SecureStore itself throws', async () => {
    const secrets = memorySecrets();
    secrets.isAvailable = async () => {
      throw new Error('no keystore');
    };
    const data = memoryKV();
    const s = createProtectedStorage({ secrets, data, cipher });
    await expect(s.setItem('k', 'v')).resolves.toBeUndefined();
    expect(await s.getItem('k')).toBe('v');
  });

  it('treats a lost key as signed out and clears the unreadable data', async () => {
    const data = memoryKV();
    const secrets = memorySecrets();
    const s = createProtectedStorage({ secrets, data, cipher });
    await s.setItem('k', SESSION);
    secrets.map.clear();
    expect(await s.getItem('k')).toBeNull();
    expect(data.map.has('k')).toBe(false);
  });

  it('removes the value, its key and any legacy copy', async () => {
    const data = memoryKV();
    const secrets = memorySecrets();
    const old = legacyStore({ k: 'old' });
    const s = createProtectedStorage({ secrets, data, cipher, legacy: old });
    await s.setItem('k', SESSION);
    await s.removeItem('k');
    expect(data.map.size + secrets.map.size + old.map.size).toBe(0);
    expect(await s.getItem('k')).toBeNull();
  });
});

describe('owner keys', () => {
  it('keys by account id, never email or a shared fallback', () => {
    expect(ownerKey({ id: 'abc' })).toBe('u:abc');
    expect(ownerKey({ id: '  ' })).toBeNull();
    expect(ownerKey(null)).toBeNull();
    expect(ownerKey(undefined, true)).toBe('demo');
  });
});

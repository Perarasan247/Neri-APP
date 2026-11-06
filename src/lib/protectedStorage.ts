/**
 * Storage for the sign-in session (access + refresh tokens) that keeps them off the disk in plain text.
 *
 * Pattern from Supabase's React Native guide ("LargeSecureStore"): the session is too big for the
 * keychain (SecureStore values are limited to about 2 KB), so it is encrypted with AES and the
 * ciphertext is kept in ordinary storage, while the random AES key lives in SecureStore
 * (iOS Keychain / Android Keystore-backed). Unlike the guide, each value gets its own random IV so
 * the same key stream is never reused.
 *
 * Pure logic with injected stores, so it is unit tested without React Native. The wiring is in
 * `secureSessionStorage.ts`.
 *
 * - Migration: a session still sitting in the old plain storage (expo-sqlite localStorage) is read,
 *   re-saved encrypted, and only then removed from the old place, so nobody is signed out.
 * - If SecureStore is unavailable (web, a device without a keystore) the value is kept in plain
 *   storage like before rather than failing; it is upgraded as soon as SecureStore works.
 */

export interface AsyncKV {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface SecretStore {
  isAvailable(): Promise<boolean>;
  get(name: string): Promise<string | null>;
  set(name: string, value: string): Promise<void>;
  remove(name: string): Promise<void>;
}

export interface Cipher {
  /** A fresh random key, hex encoded. */
  newKey(): string;
  encrypt(keyHex: string, plain: string): string;
  /** Throws when the text is not valid ciphertext for this key. */
  decrypt(keyHex: string, encrypted: string): string;
}

export interface LegacyStore {
  getItem(key: string): string | null;
  removeItem(key: string): void;
}

export const ENCRYPTED_PREFIX = 'enc1:';

/** SecureStore names allow only letters, digits, ".", "-" and "_". */
export const secretName = (key: string) => `neri-key-${key.replace(/[^A-Za-z0-9._-]/g, '_')}`;

export function createProtectedStorage(deps: { secrets: SecretStore; data: AsyncKV; cipher: Cipher; legacy?: LegacyStore | null }): AsyncKV {
  const { secrets, data, cipher, legacy } = deps;

  const available = async () => {
    try {
      return await secrets.isAvailable();
    } catch {
      return false;
    }
  };

  /** Encrypt and save; false when it had to be kept in plain storage instead. */
  const write = async (key: string, value: string): Promise<boolean> => {
    if (await available()) {
      try {
        let keyHex = await secrets.get(secretName(key));
        if (!keyHex) {
          keyHex = cipher.newKey();
          await secrets.set(secretName(key), keyHex);
        }
        await data.setItem(key, ENCRYPTED_PREFIX + cipher.encrypt(keyHex, value));
        return true;
      } catch {
        // fall through: a session that can't be saved would sign the person out on the next launch
      }
    }
    await data.setItem(key, value);
    return false;
  };

  return {
    async getItem(key) {
      let raw: string | null = null;
      try {
        raw = await data.getItem(key);
      } catch {
        raw = null;
      }

      if (raw !== null && raw.startsWith(ENCRYPTED_PREFIX)) {
        try {
          const keyHex = await secrets.get(secretName(key));
          if (!keyHex) throw new Error('key lost');
          return cipher.decrypt(keyHex, raw.slice(ENCRYPTED_PREFIX.length));
        } catch {
          // The key is gone (device restore) or the data is damaged: it can never be read again
          await data.removeItem(key).catch(() => {});
          return null;
        }
      }

      if (raw !== null) {
        // Saved in plain storage because SecureStore wasn't usable then: protect it now if possible
        if (await available()) await write(key, raw).catch(() => {});
        return raw;
      }

      // Nothing here yet: a session from before encryption may be in the old storage
      let old: string | null = null;
      try {
        old = legacy?.getItem(key) ?? null;
      } catch {
        old = null;
      }
      if (old === null) return null;
      try {
        await write(key, old);
        legacy?.removeItem(key); // only after the copy was saved
      } catch {
        // keep the old copy; migration is retried on the next read
      }
      return old;
    },

    async setItem(key, value) {
      await write(key, value);
      // A stale plain copy must not outlive the new value
      try {
        legacy?.removeItem(key);
      } catch {}
    },

    async removeItem(key) {
      await data.removeItem(key).catch(() => {});
      await secrets.remove(secretName(key)).catch(() => {});
      try {
        legacy?.removeItem(key);
      } catch {}
    },
  };
}

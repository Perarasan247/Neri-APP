import aesjs from 'aes-js';

import type { Cipher } from './protectedStorage';

/**
 * AES-256 in counter mode with a random 16-byte IV per message (stored in front of the ciphertext),
 * keys and output hex encoded. `random` must be a cryptographically secure byte source.
 */
export function createAesCipher(random: (bytes: number) => Uint8Array): Cipher {
  const hex = aesjs.utils.hex;
  const utf8 = aesjs.utils.utf8;
  return {
    newKey: () => hex.fromBytes(random(32)),
    encrypt(keyHex, plain) {
      const iv = random(16);
      const ctr = new aesjs.ModeOfOperation.ctr(hex.toBytes(keyHex), new aesjs.Counter(iv));
      return hex.fromBytes(iv) + hex.fromBytes(ctr.encrypt(utf8.toBytes(plain)));
    },
    decrypt(keyHex, encrypted) {
      if (!/^[0-9a-f]+$/i.test(encrypted) || encrypted.length < 32 || encrypted.length % 2) throw new Error('not ciphertext');
      const iv = hex.toBytes(encrypted.slice(0, 32));
      const ctr = new aesjs.ModeOfOperation.ctr(hex.toBytes(keyHex), new aesjs.Counter(iv));
      return utf8.fromBytes(ctr.decrypt(hex.toBytes(encrypted.slice(32))));
    },
  };
}

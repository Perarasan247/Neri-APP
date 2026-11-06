import 'expo-sqlite/localStorage/install'; // the old, plain session store: read once to migrate
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getRandomBytes } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

import { createAesCipher } from './aesCipher';
import { createProtectedStorage } from './protectedStorage';

/** Where the Supabase session is kept: AES-encrypted, with the key in the platform keystore. */
export const sessionStorage = createProtectedStorage({
  secrets: {
    isAvailable: () => SecureStore.isAvailableAsync(),
    get: (name) => SecureStore.getItemAsync(name, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY }),
    // AFTER_FIRST_UNLOCK: the widget's background task may run while the phone is locked
    set: (name, value) => SecureStore.setItemAsync(name, value, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY }),
    remove: (name) => SecureStore.deleteItemAsync(name),
  },
  data: AsyncStorage,
  cipher: createAesCipher((n) => getRandomBytes(n)),
  legacy: typeof localStorage !== 'undefined' ? localStorage : null,
});

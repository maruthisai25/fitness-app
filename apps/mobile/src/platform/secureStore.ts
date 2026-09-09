/**
 * `SecureStore` adapter over `expo-secure-store` (DESIGN.md §7.3, §11).
 *
 * The device Keychain (iOS) / Keystore (Android) backs every value, which is
 * why this is the only place the Anthropic API key may live on-device
 * (DESIGN.md §6.1, §8) — `packages/ai/client.ts` and the settings screen read
 * it through this adapter, nothing else.
 */
import * as ExpoSecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import type { SecureStore } from '@vigor/platform';

export function createSecureStore(): SecureStore {
  return {
    async get(key) {
      return ExpoSecureStore.getItemAsync(key);
    },
    async set(key, value) {
      await ExpoSecureStore.setItemAsync(key, value);
    },
    async remove(key) {
      await ExpoSecureStore.deleteItemAsync(key);
    },
    isHardwareBacked() {
      // expo-secure-store maps to Keychain/Keystore on both native platforms;
      // isAvailableAsync() is async and would force this method to lie about
      // its return type, so we key off the platform instead.
      return Platform.OS === 'ios' || Platform.OS === 'android';
    },
  };
}

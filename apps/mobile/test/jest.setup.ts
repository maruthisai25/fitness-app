/**
 * Test bootstrap for the rendering tests that run under `jest-expo`.
 *
 * The React Native runtime itself comes from the preset — platform-extension
 * resolution, the native-module mocks, `__DEV__`. What is left is the Expo
 * modules this app imports statically from `src/platform`: any test that
 * reaches a repository or an adapter would otherwise touch a device API that
 * does not exist off-device.
 *
 * The vitest projects have their own bootstrap in `test/setup.ts`; the two are
 * deliberately separate because the module systems are.
 *
 * `jest`, `describe`, `it` and `expect` are globals here (typed by
 * `@types/jest` through `tsconfig.jest.json`), not imports — `@jest/globals`
 * is a transitive dependency and pnpm's strict layout does not expose it.
 */

jest.mock('expo-secure-store', () => ({
  getItemAsync: async () => null,
  setItemAsync: async () => undefined,
  deleteItemAsync: async () => undefined,
}));

jest.mock('expo-file-system', () => ({
  Directory: class {
    create(): void {}
  },
  File: class {
    exists = false;
  },
  Paths: { document: {} },
}));

jest.mock('expo-network', () => ({
  addNetworkStateListener: () => ({ remove: () => undefined }),
  getNetworkStateAsync: async () => ({ isConnected: true, isInternetReachable: true }),
}));

jest.mock('expo-crypto', () => ({
  AESEncryptionKey: class {},
  AESSealedData: class {},
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  aesEncryptAsync: async () => ({}),
  aesDecryptAsync: async () => new Uint8Array(),
  digest: async () => new Uint8Array(32),
  getRandomBytesAsync: async () => new Uint8Array(16),
}));

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: async () => {
    throw new Error('expo-sqlite is not available in component tests');
  },
}));

jest.mock('expo-notifications', () => ({
  SchedulableTriggerInputTypes: { DATE: 'date' },
  requestPermissionsAsync: async () => ({ granted: true }),
  getPermissionsAsync: async () => ({ granted: true }),
  scheduleNotificationAsync: async () => 'notification-id',
  cancelScheduledNotificationAsync: async () => undefined,
  cancelAllScheduledNotificationsAsync: async () => undefined,
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: () => undefined,
    replace: () => undefined,
    back: () => undefined,
    canGoBack: () => true,
  }),
  useSegments: () => [] as string[],
  useLocalSearchParams: () => ({}),
}));

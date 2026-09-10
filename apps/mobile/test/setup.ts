/**
 * Test bootstrap for the vitest projects (`vitest.config.mts`). The rendering
 * tests under `jest-expo` have their own, in `test/jest.setup.ts`.
 *
 * Two things happen here, in this order:
 *
 * 1. `react-native` resolution is pointed at the host shims in this directory.
 *    Vite's `resolve.alias` (see `vitest.config.mts`) covers the modules Vite
 *    transforms; `resolveReactNative.cjs` covers the CommonJS ones Node loads
 *    itself, such as `@testing-library/react-native`. The patch has to be in
 *    place before Testing Library is imported.
 * 2. The Expo native modules are stubbed. `src/platform` imports them
 *    statically, so any test that reaches a repository or an adapter would
 *    otherwise touch a device API that does not exist off-device.
 */
import './resolveReactNative.cjs';

import '@testing-library/react-native';

import { vi } from 'vitest';

// React 19 reads this to decide whether updates must be wrapped in `act`.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// `__DEV__` is already declared by React Native's own types, so this only sets
// it — re-declaring it here would clash with them.
(globalThis as unknown as { __DEV__: boolean }).__DEV__ = true;

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => undefined),
  deleteItemAsync: vi.fn(async () => undefined),
}));

vi.mock('expo-file-system', () => ({
  Directory: class {
    create() {}
  },
  File: class {
    exists = false;
  },
  Paths: { document: {} },
}));

vi.mock('expo-network', () => ({
  addNetworkStateListener: () => ({ remove: () => undefined }),
  getNetworkStateAsync: async () => ({ isConnected: true, isInternetReachable: true }),
}));

vi.mock('expo-crypto', () => ({
  AESEncryptionKey: class {},
  AESSealedData: class {},
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  aesEncryptAsync: async () => ({}),
  aesDecryptAsync: async () => new Uint8Array(),
  digest: async () => new Uint8Array(32),
  getRandomBytesAsync: async () => new Uint8Array(16),
}));

vi.mock('expo-sqlite', () => ({
  openDatabaseAsync: async () => {
    throw new Error('expo-sqlite is not available in component tests');
  },
}));

vi.mock('expo-notifications', () => ({
  SchedulableTriggerInputTypes: { DATE: 'date' },
  requestPermissionsAsync: vi.fn(async () => ({ granted: true })),
  getPermissionsAsync: vi.fn(async () => ({ granted: true })),
  scheduleNotificationAsync: vi.fn(async () => 'notification-id'),
  cancelScheduledNotificationAsync: vi.fn(async () => undefined),
  cancelAllScheduledNotificationsAsync: vi.fn(async () => undefined),
}));

vi.mock('expo-router', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    canGoBack: () => true,
  }),
  useLocalSearchParams: () => ({}),
}));

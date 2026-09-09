/**
 * Test bootstrap.
 *
 * The screens under test reach the database and the platform adapters through
 * `AppDataProvider`, and the tests inject an in-memory database plus fake
 * adapters. The Expo native modules are still imported statically by
 * `src/platform`, so they are stubbed here — nothing in a component test
 * should touch a device API.
 */
import Module from 'node:module';
import { vi } from 'vitest';

// `__DEV__` is already declared by React Native's own types, so this only sets
// it — re-declaring it here would clash with them.
(globalThis as unknown as { __DEV__: boolean }).__DEV__ = true;

// React Native's batched bridge refuses to initialise without a config. There
// is no native side in a component test, so hand it an empty one.
(globalThis as unknown as { __fbBatchedBridgeConfig: unknown }).__fbBatchedBridgeConfig = {
  remoteModuleConfig: [],
  localModulesConfig: [],
};

/**
 * The native-module layer.
 *
 * `TurboModuleRegistry.getEnforcing('SourceCode')` throws the moment React
 * Native is imported without a native binary behind it — this is what
 * `react-native/jest/setup.js` papers over for a Jest project. That file is
 * written against Jest's globals, so the same job is done here: a proxy that
 * hands back a stub module for any name, carrying the constants the modules
 * actually read. It must be installed before the first `react-native` import,
 * because `TurboModuleRegistry` captures `global.__turboModuleProxy` at load.
 */
const SCREEN = { width: 390, height: 844, scale: 3, fontScale: 1 };

const NATIVE_CONSTANTS: Record<string, Record<string, unknown>> = {
  SourceCode: { scriptURL: null },
  PlatformConstants: {
    forceTouchAvailable: false,
    interfaceIdiom: 'phone',
    isTesting: true,
    osVersion: '18.0',
    systemName: 'iOS',
    reactNativeVersion: { major: 0, minor: 86, patch: 3, prerelease: null },
  },
  DeviceInfo: {
    Dimensions: { window: SCREEN, screen: SCREEN, windowPhysicalPixels: SCREEN },
    isIPhoneX_deprecated: false,
  },
  I18nManager: { isRTL: false, doLeftAndRightSwapInRTL: true, localeIdentifier: 'en_US' },
  StatusBarManager: { HEIGHT: 44, DEFAULT_BACKGROUND_COLOR: 'black' },
  Appearance: { colorScheme: 'dark' },
  SettingsManager: { settings: {} },
  AccessibilityInfo: {},
  KeyboardObserver: {},
  Networking: {},
  UIManager: {},
};

const nativeModules = new Map<string, Record<string, unknown>>();

function stubNativeModule(name: string): Record<string, unknown> {
  const cached = nativeModules.get(name);
  if (cached) return cached;

  const constants = NATIVE_CONSTANTS[name] ?? {};
  const target: Record<string, unknown> = {
    ...constants,
    getConstants: () => constants,
    // `NativeEventEmitter` requires these on every module it wraps.
    addListener: () => undefined,
    removeListeners: () => undefined,
  };
  const module = new Proxy(target, {
    get(owner, property) {
      if (property in owner || typeof property !== 'string') {
        return owner[property as string];
      }
      // Anything else is a method nothing in a component test can observe.
      const noop = (): undefined => undefined;
      owner[property] = noop;
      return noop;
    },
  });
  nativeModules.set(name, module);
  return module;
}

(globalThis as unknown as { __turboModuleProxy: (name: string) => unknown }).__turboModuleProxy =
  stubNativeModule;
(globalThis as unknown as { nativeModuleProxy: unknown }).nativeModuleProxy = new Proxy(
  {},
  { get: (_target, property) => (typeof property === 'string' ? stubNativeModule(property) : undefined) },
);

/**
 * React Native and the Expo packages ship CommonJS with Flow annotations, so
 * no JavaScript parser reads them as-is. `./nativeLoader.mjs` runs Metro's
 * Babel preset over them as Node loads them — the equivalent of what
 * `babel-jest` does for a Jest project.
 */
Module.register(new URL('./nativeLoader.mjs', import.meta.url));

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

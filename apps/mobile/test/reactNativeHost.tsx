/**
 * The `react-native` module as the component tests see it.
 *
 * React Native ships Flow-typed source that only Metro's Babel pipeline can
 * parse, so Vitest cannot import the real package. `vitest.config.ts` aliases
 * `react-native` to this file: it renders the same host component names the
 * real renderer produces (`View`, `Text`, `TextInput`, `RCTScrollView`,
 * `RCTSwitch`, `Image`, `Modal`), which is exactly what
 * `@testing-library/react-native` matches its queries against, and it passes
 * every prop straight through so `fireEvent.press` / `fireEvent.changeText`
 * reach the handlers under test.
 *
 * It is a rendering shim, nothing more — the screens under test are the real
 * ones, the repositories are a real migrated SQLite database, and the engines
 * are the real `@vigor/core` engines.
 */
import * as React from 'react';

type AnyProps = Record<string, unknown> & { children?: React.ReactNode };

function hostComponent(hostName: string) {
  const Component = React.forwardRef<unknown, AnyProps>((props, ref) =>
    React.createElement(hostName, { ...props, ref }),
  );
  Component.displayName = hostName;
  return Component;
}

export const View = hostComponent('View');
export const Text = hostComponent('Text');
export const TextInput = hostComponent('TextInput');
export const Image = hostComponent('Image');
export const Modal = hostComponent('Modal');
export const ActivityIndicator = hostComponent('ActivityIndicator');
export const ScrollView = hostComponent('RCTScrollView');
export const SafeAreaView = hostComponent('View');

/** `Switch` reports its value through `accessibilityState` the way RN does. */
export const Switch = React.forwardRef<unknown, AnyProps>((props, ref) =>
  React.createElement('RCTSwitch', {
    ...props,
    accessibilityRole: 'switch',
    accessibilityState: { checked: props.value === true },
    ref,
  }),
);
Switch.displayName = 'Switch';

/**
 * `Pressable` accepts a style callback and a render-prop child in the real
 * library, so the shim resolves both before handing the result to a host
 * `View` — otherwise a pressed-state style would render as a function.
 */
export const Pressable = React.forwardRef<unknown, AnyProps>((props, ref) => {
  const { style, children, ...rest } = props;
  const state = { pressed: false };
  return React.createElement(
    'View',
    {
      ...rest,
      style: typeof style === 'function' ? (style as (s: typeof state) => unknown)(state) : style,
      ref,
    },
    typeof children === 'function'
      ? (children as (s: typeof state) => React.ReactNode)(state)
      : (children as React.ReactNode),
  );
});
Pressable.displayName = 'Pressable';

export const TouchableOpacity = Pressable;

function flattenStyle(style: unknown): Record<string, unknown> {
  if (style == null || typeof style === 'boolean') return {};
  if (Array.isArray(style)) {
    return style.reduce<Record<string, unknown>>(
      (merged, entry) => ({ ...merged, ...flattenStyle(entry) }),
      {},
    );
  }
  return style as Record<string, unknown>;
}

export const StyleSheet = {
  create: <T extends Record<string, unknown>>(styles: T): T => styles,
  flatten: flattenStyle,
  compose: (a: unknown, b: unknown) => [a, b],
  hairlineWidth: 1,
  absoluteFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  absoluteFillObject: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
};

export const Platform = {
  OS: 'ios' as const,
  Version: 18,
  select: <T,>(spec: { ios?: T; android?: T; native?: T; default?: T }): T | undefined =>
    spec.ios ?? spec.native ?? spec.default,
};

export function useWindowDimensions(): {
  width: number;
  height: number;
  scale: number;
  fontScale: number;
} {
  return { width: 390, height: 844, scale: 3, fontScale: 1 };
}

export const Dimensions = {
  get: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }),
  addEventListener: () => ({ remove: () => undefined }),
};

export const Keyboard = { dismiss: () => undefined };

export const Alert = { alert: () => undefined };

export const AppState = {
  currentState: 'active' as const,
  addEventListener: () => ({ remove: () => undefined }),
};

/**
 * `react-native-svg` mixes React Native's legacy `Touchable` into every shape.
 * The charts under test never receive a touch, so an empty mixin is enough to
 * let the library load.
 */
export const Touchable = { Mixin: {} as Record<string, unknown> };

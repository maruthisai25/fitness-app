/**
 * `react-native-safe-area-context` for the component tests. The real package
 * reaches for a native module; the screens only ever read the insets.
 */
import * as React from 'react';

const ZERO_INSETS = { top: 0, right: 0, bottom: 0, left: 0 };

export function useSafeAreaInsets(): typeof ZERO_INSETS {
  return ZERO_INSETS;
}

export function useSafeAreaFrame(): { x: number; y: number; width: number; height: number } {
  return { x: 0, y: 0, width: 390, height: 844 };
}

export function SafeAreaProvider({ children }: { children: React.ReactNode }) {
  return React.createElement(React.Fragment, null, children);
}

export function SafeAreaView({ children }: { children: React.ReactNode }) {
  return React.createElement('View', null, children);
}

export const initialWindowMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: ZERO_INSETS,
};

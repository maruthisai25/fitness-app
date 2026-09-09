/**
 * CommonJS twin of `reactNativeHost.tsx`.
 *
 * `@testing-library/react-native` ships CommonJS and is loaded by Node rather
 * than by Vite, so Vite's alias never reaches its own `require('react-native')`
 * — which would drag in React Native's Flow-typed source and fail to parse.
 * `resolveReactNative.cjs` points that one require at this file instead. The
 * library only reads `StyleSheet` from it; the components under test use the
 * `.tsx` twin through the Vite alias.
 */
'use strict';

const React = require('react');

function flattenStyle(style) {
  if (style == null || typeof style === 'boolean') return {};
  if (Array.isArray(style)) {
    return style.reduce((merged, entry) => Object.assign(merged, flattenStyle(entry)), {});
  }
  return style;
}

function hostComponent(hostName) {
  const Component = React.forwardRef((props, ref) =>
    React.createElement(hostName, Object.assign({}, props, { ref })),
  );
  Component.displayName = hostName;
  return Component;
}

module.exports = {
  View: hostComponent('View'),
  Text: hostComponent('Text'),
  TextInput: hostComponent('TextInput'),
  Image: hostComponent('Image'),
  Modal: hostComponent('Modal'),
  ActivityIndicator: hostComponent('ActivityIndicator'),
  ScrollView: hostComponent('RCTScrollView'),
  Switch: hostComponent('RCTSwitch'),
  Pressable: hostComponent('View'),
  StyleSheet: {
    create: (styles) => styles,
    flatten: flattenStyle,
    compose: (a, b) => [a, b],
    hairlineWidth: 1,
    absoluteFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    absoluteFillObject: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  },
  Platform: { OS: 'ios', Version: 18, select: (spec) => spec.ios ?? spec.native ?? spec.default },
};

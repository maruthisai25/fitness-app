/**
 * `react-native-svg` as the component tests see it.
 *
 * The real package reaches deep into React Native's internals (`Touchable`,
 * `processColor`, the native shape components) and cannot load without a native
 * binary. The charts under test only need the elements to render with their
 * props intact so a query can find the text inside a ring; the geometry itself
 * is `@vigor/core`'s (`buildProgressSeries`) and is tested there.
 */
import * as React from 'react';

type AnyProps = Record<string, unknown> & { children?: React.ReactNode };

function svgComponent(hostName: string) {
  const Component = React.forwardRef<unknown, AnyProps>((props, ref) =>
    React.createElement(hostName, { ...props, ref }),
  );
  Component.displayName = hostName;
  return Component;
}

export const Svg = svgComponent('Svg');
export const Circle = svgComponent('Circle');
export const Ellipse = svgComponent('Ellipse');
export const G = svgComponent('G');
export const Line = svgComponent('Line');
export const Path = svgComponent('Path');
export const Polygon = svgComponent('Polygon');
export const Polyline = svgComponent('Polyline');
export const Rect = svgComponent('Rect');
export const Text = svgComponent('SvgText');
export const TSpan = svgComponent('TSpan');
export const Defs = svgComponent('Defs');
export const LinearGradient = svgComponent('LinearGradient');
export const Stop = svgComponent('Stop');
export const ClipPath = svgComponent('ClipPath');

export default Svg;

import { fontFamily, space } from '@vigor/ui-tokens';

import { themeColor } from './theme/cssVars';
import { fontSize } from './theme/typeScale';

interface PlaceholderProps {
  title: string;
  blurb: string;
}

/**
 * Phase 0 stand-in for a destination. The app-shell agent replaces these with
 * the real screens (DESIGN.md §7.1).
 */
export function Placeholder({ title, blurb }: PlaceholderProps) {
  return (
    <section style={{ padding: space.xl, maxWidth: 720 }}>
      <h1
        style={{
          fontFamily: fontFamily.display,
          fontSize: fontSize.display,
          color: themeColor.text,
          margin: 0,
        }}
      >
        {title}
      </h1>
      <p
        style={{
          fontFamily: fontFamily.body,
          fontSize: fontSize.body,
          color: themeColor.textMuted,
          marginTop: space.md,
          lineHeight: 1.45,
        }}
      >
        {blurb}
      </p>
    </section>
  );
}

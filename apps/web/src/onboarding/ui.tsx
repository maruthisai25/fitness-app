import { fontFamily, radius, space } from '@vigor/ui-tokens';
import type { ReactNode } from 'react';

import { themeColor } from '../theme/cssVars';

export { Field, PrimaryButton, SecondaryButton, Select, TextInput } from '../components/form';

/** The step-progress chrome wrapping every onboarding screen (DESIGN.md §9). */
export function OnboardingShell({
  stepIndex,
  stepCount,
  children,
}: {
  stepIndex: number;
  stepCount: number;
  children: ReactNode;
}): ReactNode {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        justifyContent: 'center',
        background: themeColor.bg,
        fontFamily: fontFamily.body,
        padding: space.xl,
      }}
    >
      <div style={{ width: '100%', maxWidth: 560, paddingTop: space.xxl }}>
        <div style={{ display: 'flex', gap: space.xs, marginBottom: space.xxl }}>
          {Array.from({ length: stepCount }, (_, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                height: 4,
                borderRadius: radius.pill,
                background: i <= stepIndex ? themeColor.accent : themeColor.border,
              }}
            />
          ))}
        </div>
        {children}
      </div>
    </div>
  );
}

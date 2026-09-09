import { fontFamily, radius, space } from '@vigor/ui-tokens';
import type { ReactNode } from 'react';
import { NavLink, Route, Routes } from 'react-router';

import { useDb } from './db/provider';
import { DESTINATIONS } from './destinations';
import { EatSection } from './eat/EatSection';
import { OnboardingFlow } from './onboarding/OnboardingFlow';
import { Placeholder } from './Placeholder';
import { ProgressSection } from './progress/ProgressSection';
import { themeColor } from './theme/cssVars';
import { fontSize } from './theme/typeScale';
import { YouSection } from './you/YouSection';

/** Destinations that own a real section already; the rest still show a placeholder. */
const ROUTED_PATHS = new Set(['/you', '/eat', '/progress']);

/**
 * Phase 0 shell — DESIGN.md §7.1 sidebar with the five destinations, gated
 * on onboarding (DESIGN.md §9 phase 0).
 */
export function App(): ReactNode {
  const { settings, refreshSettings } = useDb();

  if (!settings.onboardingComplete) {
    return <OnboardingFlow onComplete={() => void refreshSettings()} />;
  }

  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        background: themeColor.bg,
        fontFamily: fontFamily.body,
      }}
    >
      <nav
        aria-label="Primary"
        style={{
          width: 220,
          flexShrink: 0,
          borderRight: `1px solid ${themeColor.border}`,
          background: themeColor.surface,
          padding: space.lg,
        }}
      >
        <p
          style={{
            fontFamily: fontFamily.display,
            fontSize: fontSize.heading,
            color: themeColor.text,
            margin: `0 0 ${space.xl}px`,
            letterSpacing: '0.02em',
          }}
        >
          VigorEngine
        </p>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {DESTINATIONS.map((destination) => (
            <li key={destination.path} style={{ marginBottom: space.xs }}>
              <NavLink
                to={destination.path}
                end={destination.path === '/'}
                style={({ isActive }) => ({
                  display: 'block',
                  padding: `${space.sm}px ${space.md}px`,
                  borderRadius: radius.md,
                  textDecoration: 'none',
                  fontSize: fontSize.subheading,
                  color: isActive ? themeColor.textOnAccent : themeColor.textMuted,
                  background: isActive ? themeColor.accent : 'transparent',
                })}
              >
                {destination.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <main style={{ flex: 1, minWidth: 0 }}>
        <Routes>
          {DESTINATIONS.filter((destination) => !ROUTED_PATHS.has(destination.path)).map(
            (destination) => (
              <Route
                key={destination.path}
                path={destination.path}
                element={<Placeholder title={destination.label} blurb={destination.blurb} />}
              />
            ),
          )}
          <Route path="/you/*" element={<YouSection />} />
          <Route path="/eat/*" element={<EatSection />} />
          <Route path="/progress/*" element={<ProgressSection />} />
          <Route
            path="*"
            element={<Placeholder title="Not found" blurb="That screen does not exist yet." />}
          />
        </Routes>
      </main>
    </div>
  );
}

import { fontFamily, radius, space } from '@vigor/ui-tokens';
import type { ReactNode } from 'react';
import { NavLink, Route, Routes } from 'react-router';

import { CoachProvider } from './coach/CoachProvider';
import { useDb } from './db/provider';
import { DESTINATIONS } from './destinations';
import { EatSection } from './eat/EatSection';
import { OnboardingFlow } from './onboarding/OnboardingFlow';
import { Placeholder } from './Placeholder';
import { useForegroundRunner } from './progress/foreground';
import { ProgressSection } from './progress/ProgressSection';
import { SafetyBanner } from './safety/SafetyBanner';
import { SessionMode } from './session/SessionMode';
import { themeColor } from './theme/cssVars';
import { TodaySection } from './today/TodaySection';
import { TrainSection } from './train/TrainSection';
import { fontSize } from './theme/typeScale';
import { YouSection } from './you/YouSection';

/**
 * DESIGN.md §7.1 — the five destinations in the web sidebar, gated on
 * onboarding. Session mode is a full-screen flow, so it sits outside the
 * sidebar shell (DESIGN.md §7.1: "Session mode is a full-screen flow").
 */
export function App(): ReactNode {
  const { settings, refreshSettings } = useDb();

  // The one foreground runner, above the tabs and routes: the detectors, the
  // weekly review and reminder scheduling (DESIGN.md §5.8, §5.9, §7.3) run once
  // per foreground however the user navigates, never once per section.
  useForegroundRunner();

  if (!settings.onboardingComplete) {
    return <OnboardingFlow onComplete={() => void refreshSettings()} />;
  }

  return (
    <CoachProvider>
      <Routes>
        <Route path="/session/:workoutId" element={<SessionMode />} />
        <Route path="*" element={<AppShell />} />
      </Routes>
    </CoachProvider>
  );
}

/** Sidebar, safety banner and the four in-shell destinations. */
function AppShell(): ReactNode {
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
        <SafetyBanner />
        <Routes>
          {/* All five destinations own a real section now (DESIGN.md §7.1);
              `Placeholder` is only the not-found fallback below. */}
          <Route path="/" element={<TodaySection />} />
          <Route path="/train/*" element={<TrainSection />} />
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

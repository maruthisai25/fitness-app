/**
 * Train — DESIGN.md §7.1: the exercise library, per-exercise stats and PRs,
 * workout history and detail, the manual builder, and the way into session
 * mode.
 */

import { radius, space } from '@vigor/ui-tokens';
import type { ReactNode } from 'react';
import { NavLink, Route, Routes } from 'react-router';

import { themeColor } from '../theme/cssVars';
import { fontSize } from '../theme/typeScale';
import { ExerciseDetail } from './ExerciseDetail';
import { ExerciseLibrary } from './ExerciseLibrary';
import { WorkoutBuilder } from './WorkoutBuilder';
import { WorkoutDetail } from './WorkoutDetail';
import { WorkoutHistory } from './WorkoutHistory';

const TABS = [
  { to: '/train', label: 'Library', end: true },
  { to: '/train/history', label: 'History', end: false },
  { to: '/train/builder', label: 'Build a workout', end: false },
] as const;

export function TrainSection(): ReactNode {
  return (
    <div style={{ padding: space.xl, maxWidth: 900 }}>
      <nav
        aria-label="Train"
        style={{ display: 'flex', gap: space.xs, flexWrap: 'wrap', marginBottom: space.xl }}
      >
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            style={({ isActive }) => ({
              padding: `${space.xs}px ${space.md}px`,
              borderRadius: radius.pill,
              textDecoration: 'none',
              fontSize: fontSize.label,
              color: isActive ? themeColor.textOnAccent : themeColor.textMuted,
              background: isActive ? themeColor.accent : themeColor.surfaceRaised,
            })}
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>

      <Routes>
        <Route index element={<ExerciseLibrary />} />
        <Route path="history" element={<WorkoutHistory />} />
        <Route path="builder" element={<WorkoutBuilder />} />
        <Route path="exercise/:exerciseId" element={<ExerciseDetail />} />
        <Route path="workout/:workoutId" element={<WorkoutDetail />} />
      </Routes>
    </div>
  );
}

/**
 * Progress — DESIGN.md §7.1: "strength charts (e1RM per exercise), body weight
 * and measurements, photos compare, consistency, weekly reviews", plus the
 * §5.8 insights and the §7.3 reminders. Phase 6 of DESIGN.md §9.
 */

import type { LocalDate } from '@vigor/core';
import { fontFamily, space } from '@vigor/ui-tokens';
import type { ReactNode } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router';

import { TabStripStyle } from '../components/ui';
import { webClock } from '../platform/clock';
import { themeColor } from '../theme/cssVars';
import { fontSize } from '../theme/typeScale';
import { BodyPanel } from './BodyPanel';
import { ConsistencyPanel } from './ConsistencyPanel';
import { InsightsPanel } from './InsightsPanel';
import { PhotosPanel } from './PhotosPanel';
import { RemindersPanel } from './RemindersPanel';
import { ReviewDetail, ReviewsPanel } from './ReviewsPanel';
import { StrengthPanel } from './StrengthPanel';
import { useForegroundTasks } from './foreground';

const TABS = [
  { path: 'strength', label: 'Strength' },
  { path: 'body', label: 'Body' },
  { path: 'photos', label: 'Photos' },
  { path: 'consistency', label: 'Consistency' },
  { path: 'insights', label: 'Insights' },
  { path: 'reviews', label: 'Weekly review' },
  { path: 'reminders', label: 'Reminders' },
] as const;

export function ProgressSection(): ReactNode {
  const today: LocalDate = webClock.today();

  // DESIGN.md §5.8, §5.9, §7.3 — detectors, the weekly review and reminder
  // scheduling all happen on foreground, guarded to once per calendar day.
  useForegroundTasks();

  return (
    <div style={{ padding: space.xl, maxWidth: 860 }}>
      <h1
        style={{
          fontFamily: fontFamily.display,
          fontSize: fontSize.display,
          color: themeColor.text,
          margin: 0,
        }}
      >
        Progress
      </h1>
      <nav
        aria-label="Progress sections"
        style={{
          display: 'flex',
          gap: space.xs,
          marginTop: space.lg,
          marginBottom: space.xl,
          flexWrap: 'wrap',
        }}
      >
        {TABS.map((tab) => (
          <NavLink key={tab.path} to={tab.path} style={({ isActive }) => TabStripStyle(isActive)}>
            {tab.label}
          </NavLink>
        ))}
      </nav>

      <Routes>
        <Route index element={<Navigate to="strength" replace />} />
        <Route path="strength" element={<StrengthPanel today={today} />} />
        <Route path="body" element={<BodyPanel today={today} />} />
        <Route path="photos" element={<PhotosPanel today={today} />} />
        <Route path="consistency" element={<ConsistencyPanel today={today} />} />
        <Route path="insights" element={<InsightsPanel />} />
        <Route path="reviews" element={<ReviewsPanel />} />
        <Route path="reviews/:weekStart" element={<ReviewDetail />} />
        <Route path="reminders" element={<RemindersPanel today={today} />} />
        <Route path="*" element={<Navigate to="strength" replace />} />
      </Routes>
    </div>
  );
}

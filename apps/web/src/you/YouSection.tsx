import { fontFamily, radius, space } from '@vigor/ui-tokens';
import type { ReactNode } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router';

import { themeColor } from '../theme/cssVars';
import { fontSize } from '../theme/typeScale';
import { EquipmentPanel } from './EquipmentPanel';
import { ExportImportPanel } from './ExportImportPanel';
import { GoalsPanel } from './GoalsPanel';
import { MemoriesPanel } from './MemoriesPanel';
import { ProfilePanel } from './ProfilePanel';
import { SafetyPanel } from './SafetyPanel';
import { SettingsPanel } from './SettingsPanel';

// Absolute paths, not relative ('profile', 'goals', …): a relative
// `<NavLink to>` resolves against the current URL, not this route's own
// mount point — from anywhere but the `/you` index (e.g. already on
// `/you/goals`) a relative link below would resolve to `/you/goals/settings`
// and fall through to nothing, so every tab but the first click ever leaves
// would silently no-op. Train's tabs use the same absolute style.
const TABS = [
  { path: '/you/profile', label: 'Profile' },
  { path: '/you/goals', label: 'Goals' },
  { path: '/you/equipment', label: 'Equipment' },
  { path: '/you/memories', label: 'Memories' },
  { path: '/you/safety', label: 'Safety' },
  { path: '/you/settings', label: 'Settings' },
  { path: '/you/export', label: 'Export / Import' },
] as const;

/** You — DESIGN.md §7.1: profile, goals, equipment, targets, settings, export/import. */
export function YouSection(): ReactNode {
  return (
    <div style={{ padding: space.xl, maxWidth: 720 }}>
      <h1
        style={{
          fontFamily: fontFamily.display,
          fontSize: fontSize.display,
          color: themeColor.text,
          margin: 0,
        }}
      >
        You
      </h1>
      <nav
        style={{
          display: 'flex',
          gap: space.xs,
          marginTop: space.lg,
          marginBottom: space.xl,
          flexWrap: 'wrap',
        }}
      >
        {TABS.map((tab) => (
          <NavLink
            key={tab.path}
            to={tab.path}
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
        <Route index element={<Navigate to="profile" replace />} />
        <Route path="profile" element={<ProfilePanel />} />
        <Route path="goals" element={<GoalsPanel />} />
        <Route path="equipment" element={<EquipmentPanel />} />
        <Route path="memories" element={<MemoriesPanel />} />
        <Route path="safety" element={<SafetyPanel />} />
        <Route path="settings" element={<SettingsPanel />} />
        <Route path="export" element={<ExportImportPanel />} />
      </Routes>
    </div>
  );
}

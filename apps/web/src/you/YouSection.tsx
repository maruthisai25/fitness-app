import { fontFamily, radius, space } from '@vigor/ui-tokens';
import type { ReactNode } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router';

import { themeColor } from '../theme/cssVars';
import { fontSize } from '../theme/typeScale';
import { EquipmentPanel } from './EquipmentPanel';
import { ExportImportPanel } from './ExportImportPanel';
import { GoalsPanel } from './GoalsPanel';
import { ProfilePanel } from './ProfilePanel';
import { SettingsPanel } from './SettingsPanel';

const TABS = [
  { path: 'profile', label: 'Profile' },
  { path: 'goals', label: 'Goals' },
  { path: 'equipment', label: 'Equipment' },
  { path: 'settings', label: 'Settings' },
  { path: 'export', label: 'Export / Import' },
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
        <Route path="settings" element={<SettingsPanel />} />
        <Route path="export" element={<ExportImportPanel />} />
      </Routes>
    </div>
  );
}

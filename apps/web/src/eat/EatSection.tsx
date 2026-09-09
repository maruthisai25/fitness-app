/**
 * Eat — DESIGN.md §7.1: "day log by meal, saved meals, inventory, recipes, meal
 * plans". Phases 4 and 5 of DESIGN.md §9.
 */

import type { LocalDate, MealSlot } from '@vigor/core';
import { fontFamily, space } from '@vigor/ui-tokens';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { NavLink, Navigate, Route, Routes, useNavigate, useSearchParams } from 'react-router';

import { TabStripStyle } from '../components/ui';
import { webClock } from '../platform/clock';
import { themeColor } from '../theme/cssVars';
import { fontSize } from '../theme/typeScale';
import { AddFood } from './AddFood';
import { DayLog } from './DayLog';
import { InventoryPanel } from './InventoryPanel';
import { MealPlansPanel } from './MealPlansPanel';
import { RecipeDetail, RecipesPanel } from './RecipesPanel';
import { TargetsPanel } from './TargetsPanel';
import { defaultSlotForHour, MEAL_SLOTS } from './mealSlots';

const TABS = [
  { path: 'day', label: 'Day' },
  { path: 'add', label: 'Add food' },
  { path: 'targets', label: 'Targets' },
  { path: 'inventory', label: 'Inventory' },
  { path: 'recipes', label: 'Recipes' },
  { path: 'plan', label: 'Meal plans' },
] as const;

export function EatSection(): ReactNode {
  const today: LocalDate = webClock.today();
  const [date, setDate] = useState<LocalDate>(today);

  // Insights, the weekly review and reminders are foreground work (DESIGN.md
  // §5.8, §5.9, §7.3) run by the single runner in `App`, above the routes.

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
        Eat
      </h1>
      <nav
        aria-label="Eat sections"
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
        <Route index element={<Navigate to="day" replace />} />
        <Route
          path="day"
          element={<DayLog date={date} onDateChange={setDate} today={today} />}
        />
        <Route path="add" element={<AddFoodRoute fallbackDate={date} />} />
        <Route path="targets" element={<TargetsPanel today={today} />} />
        <Route path="inventory" element={<InventoryPanel today={today} />} />
        <Route path="recipes" element={<RecipesPanel today={today} />} />
        <Route path="recipes/:recipeId" element={<RecipeDetail today={today} />} />
        <Route path="plan" element={<MealPlansPanel today={today} />} />
        <Route path="*" element={<Navigate to="day" replace />} />
      </Routes>
    </div>
  );
}

/** Reads `?date`, `?slot`, `?text` and `?mode` so a failed estimate can deep-link here. */
function AddFoodRoute({ fallbackDate }: { fallbackDate: LocalDate }): ReactNode {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const date = params.get('date') ?? fallbackDate;
  const slotParam = params.get('slot');
  const slot: MealSlot = MEAL_SLOTS.includes(slotParam as MealSlot)
    ? (slotParam as MealSlot)
    : defaultSlotForHour(new Date().getHours());
  const modeParam = params.get('mode');
  const mode =
    modeParam === 'manual' || modeParam === 'saved' || modeParam === 'describe'
      ? modeParam
      : 'describe';

  return (
    <AddFood
      date={date}
      initialSlot={slot}
      initialText={params.get('text') ?? ''}
      initialMode={mode}
      onLogged={() => void navigate('/eat/day')}
    />
  );
}

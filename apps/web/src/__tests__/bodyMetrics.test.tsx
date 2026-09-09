/**
 * Body-metrics component test — DESIGN.md §5.10 and §11: "Never store display
 * units."
 *
 * An imperial profile types pounds and inches; the row that lands in SQLite is
 * kilograms and centimetres, and what comes back on screen is the pounds and
 * inches that were typed.
 */

import { KG_PER_LB, CM_PER_IN } from '@vigor/core';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../db/provider', async () => {
  const { useDbFromRef } = await import('../test/dbRef');
  return { useDb: useDbFromRef };
});

import { BodyPanel } from '../progress/BodyPanel';
import { createHarness, renderWithProviders } from '../test/harness';

const TODAY = '2026-09-10';

let harness: Awaited<ReturnType<typeof createHarness>>;

afterEach(async () => {
  await harness.close();
});

describe('Progress → Body', () => {
  beforeEach(async () => {
    harness = await createHarness();
  });

  it('round-trips imperial input through canonical metric storage', async () => {
    await harness.db.repos.profile.save({
      displayName: 'Test profile',
      unitSystem: 'imperial',
    });

    const user = userEvent.setup();
    renderWithProviders(<BodyPanel today={TODAY} />);

    // The labels themselves prove which units the user is being asked for.
    const weightField = await screen.findByLabelText(/body weight \(lb\)/i);
    const waistField = screen.getByLabelText(/waist \(in\)/i);

    await user.type(weightField, '180');
    await user.type(waistField, '32');
    await user.click(screen.getByRole('button', { name: /save measurement/i }));

    await waitFor(async () => {
      expect(await harness.db.repos.body.getMetricByDate(TODAY)).not.toBeNull();
    });

    const stored = await harness.db.repos.body.getMetricByDate(TODAY);
    // Stored canonical (DESIGN.md §4): kg and cm, never lb or in.
    expect(stored?.weightKg).toBeCloseTo(180 * KG_PER_LB, 4);
    expect(stored?.waistCm).toBeCloseTo(32 * CM_PER_IN, 4);
    expect(stored?.weightKg).not.toBe(180);

    // …and the screen reads back exactly what was typed, in the same units.
    const compareCard = (await screen.findByText(/^Latest 2026-09-10/)).parentElement;
    expect(compareCard?.textContent).toContain('180 lb');
    expect(compareCard?.textContent).toContain('32 in');
  });

  it('stores metric input unchanged for a metric profile', async () => {
    await harness.db.repos.profile.save({ displayName: 'Test profile', unitSystem: 'metric' });

    const user = userEvent.setup();
    renderWithProviders(<BodyPanel today={TODAY} />);

    await user.type(await screen.findByLabelText(/body weight \(kg\)/i), '81.6');
    await user.click(screen.getByRole('button', { name: /save measurement/i }));

    await waitFor(async () => {
      expect(await harness.db.repos.body.getMetricByDate(TODAY)).not.toBeNull();
    });
    const stored = await harness.db.repos.body.getMetricByDate(TODAY);
    expect(stored?.weightKg).toBeCloseTo(81.6, 6);
    expect(stored?.waistCm).toBeNull();
  });

  it('keeps the fields it was not asked about when the same date is saved again', async () => {
    await harness.db.repos.profile.save({ displayName: 'Test profile', unitSystem: 'metric' });

    const user = userEvent.setup();
    renderWithProviders(<BodyPanel today={TODAY} />);

    // Morning: the scale and the chest tape.
    await user.type(await screen.findByLabelText(/body weight \(kg\)/i), '81.6');
    await user.type(screen.getByLabelText(/chest \(cm\)/i), '100');
    await user.type(screen.getByLabelText(/^notes$/i), 'Before breakfast');
    await user.click(screen.getByRole('button', { name: /save measurement/i }));

    await waitFor(async () => {
      expect((await harness.db.repos.body.getMetricByDate(TODAY))?.weightKg).not.toBeNull();
    });

    // Evening: only the waist and one more measurement, everything else blank.
    await user.type(screen.getByLabelText(/waist \(cm\)/i), '85');
    await user.type(screen.getByLabelText(/thigh \(cm\)/i), '58');
    await user.click(screen.getByRole('button', { name: /save measurement/i }));

    await waitFor(async () => {
      expect((await harness.db.repos.body.getMetricByDate(TODAY))?.waistCm).not.toBeNull();
    });

    const stored = await harness.db.repos.body.getMetricByDate(TODAY);
    // The blank fields meant "leave it alone", not "clear it".
    expect(stored?.weightKg).toBeCloseTo(81.6, 6);
    expect(stored?.notes).toBe('Before breakfast');
    expect(stored?.waistCm).toBeCloseTo(85, 6);
    // …and measurements merged rather than replaced the earlier map.
    expect(stored?.measurements.chestCm).toBeCloseTo(100, 6);
    expect(stored?.measurements.thighCm).toBeCloseTo(58, 6);

    // One row per day, still (DESIGN.md §4.1 `body_metrics`).
    expect(await harness.db.repos.body.listMetrics({ from: TODAY, to: TODAY })).toHaveLength(1);
  });
});

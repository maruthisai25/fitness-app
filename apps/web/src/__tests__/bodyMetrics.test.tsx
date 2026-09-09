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
});

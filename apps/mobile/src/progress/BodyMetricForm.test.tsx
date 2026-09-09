/**
 * Body metrics component tests.
 *
 * DESIGN.md §1 and §4: the user types display units, storage is canonical
 * metric. These tests prove the imperial round trip — 180 lb goes in, 81.65 kg
 * is stored, and 180 lb comes back out — and that a metric profile stores what
 * it typed unchanged.
 */
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createTestDatabase, type TestDatabase } from '@vigor/db/testing';

import { renderWithProviders } from '../testing/renderWithProviders';
import { BodyMetricForm } from './BodyMetricForm';

const DATE = '2026-09-10';

let db: TestDatabase;

beforeEach(async () => {
  db = await createTestDatabase();
});

afterEach(async () => {
  await db.close();
});

describe('BodyMetricForm', () => {
  it('round-trips imperial input through canonical metric storage', async () => {
    await renderWithProviders(
      <BodyMetricForm repos={db.repos} date={DATE} unitSystem="imperial" />,
    );

    await fireEvent.changeText(screen.getByLabelText('Weight'), '180');
    await fireEvent.changeText(screen.getByLabelText('Waist'), '34');
    await fireEvent.changeText(screen.getByLabelText('Arm'), '15.5');

    await fireEvent.press(screen.getByText('Save measurements'));

    await waitFor(async () => {
      expect(await db.repos.body.getMetricByDate(DATE)).not.toBeNull();
    });

    const stored = await db.repos.body.getMetricByDate(DATE);
    expect(stored?.weightKg).toBeCloseTo(81.6466, 3);
    expect(stored?.waistCm).toBeCloseTo(86.36, 3);
    expect(stored?.measurements.armCm).toBeCloseTo(39.37, 2);

    // The form re-reads what was stored, so the user sees their own numbers.
    expect(screen.getByLabelText('Weight').props.value).toBe('180');
    expect(screen.getByLabelText('Waist').props.value).toBe('34');
    expect(screen.getByLabelText('Arm').props.value).toBe('15.5');
  });

  it('stores metric input unchanged', async () => {
    await renderWithProviders(<BodyMetricForm repos={db.repos} date={DATE} unitSystem="metric" />);

    await fireEvent.changeText(screen.getByLabelText('Weight'), '81.6');
    await fireEvent.press(screen.getByText('Save measurements'));

    await waitFor(async () => {
      expect(await db.repos.body.getMetricByDate(DATE)).not.toBeNull();
    });

    const stored = await db.repos.body.getMetricByDate(DATE);
    expect(stored?.weightKg).toBe(81.6);
    expect(stored?.waistCm).toBeNull();
    expect(screen.getByLabelText('Weight').props.value).toBe('81.6');
  });

  it('starts from the row already stored for that day', async () => {
    await db.repos.body.upsertMetric({ date: DATE, weightKg: 90.7185, measurements: {} });
    const existing = await db.repos.body.getMetricByDate(DATE);

    await renderWithProviders(
      <BodyMetricForm repos={db.repos} date={DATE} unitSystem="imperial" initial={existing} />,
    );

    expect(screen.getByLabelText('Weight').props.value).toBe('200');
  });

  it('refuses an empty save rather than writing a blank row', async () => {
    await renderWithProviders(<BodyMetricForm repos={db.repos} date={DATE} unitSystem="metric" />);

    await fireEvent.press(screen.getByText('Save measurements'));

    await waitFor(() =>
      expect(screen.getByText('Fill in at least one number before saving.')).toBeTruthy(),
    );
    expect(await db.repos.body.getMetricByDate(DATE)).toBeNull();
  });
});

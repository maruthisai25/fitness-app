/**
 * Safety screen component tests — DESIGN.md §7.1 "You" lists safety events;
 * §6.5 owns the resolve behaviour reused here from `SafetyBanner`.
 */

import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createHarness, renderAt, type Harness } from '../testing/harness';
import { SafetyPanel } from './SafetyPanel';

let harness: Harness;

beforeEach(async () => {
  harness = await createHarness();
});

afterEach(async () => {
  cleanup();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await harness.db.close();
});

function renderPanel() {
  return renderAt(harness, '/', '/', <SafetyPanel />);
}

describe('SafetyPanel', () => {
  it('lists every event, open first newest-first then resolved newest-first, and keeps resolved ones readable', async () => {
    const oldResolved = await harness.repos.safety.create({
      date: '2026-09-01',
      kind: 'pain',
      text: 'Old resolved knee twinge',
      source: 'readiness',
    });
    await harness.repos.safety.resolve(oldResolved.id, 'Rested a few days.');

    const recentResolved = await harness.repos.safety.create({
      date: '2026-09-05',
      kind: 'symptom',
      text: 'Recent resolved dizziness',
      source: 'chat',
    });
    await harness.repos.safety.resolve(recentResolved.id, 'Ate something; it passed.');

    await harness.repos.safety.create({
      date: '2026-09-02',
      kind: 'injury',
      text: 'Older open shoulder pain',
      source: 'session',
    });
    await harness.repos.safety.create({
      date: '2026-09-08',
      kind: 'pain',
      text: 'Newest open knee pain',
      source: 'readiness',
    });

    const view = renderPanel();
    await screen.findByText('Newest open knee pain');

    // Both resolved rows stay on screen and readable, note included.
    expect(screen.getByText('Old resolved knee twinge')).toBeTruthy();
    expect(screen.getByText('Recent resolved dizziness')).toBeTruthy();
    expect(screen.getByText('Note: Rested a few days.')).toBeTruthy();
    expect(screen.getByText('Note: Ate something; it passed.')).toBeTruthy();

    // Only the two open rows offer Resolve.
    expect(screen.getAllByRole('button', { name: 'Resolve' })).toHaveLength(2);

    const text = view.container.textContent ?? '';
    const newestOpen = text.indexOf('Newest open knee pain');
    const olderOpen = text.indexOf('Older open shoulder pain');
    const recentResolvedIdx = text.indexOf('Recent resolved dizziness');
    const oldResolvedIdx = text.indexOf('Old resolved knee twinge');

    // Open first, newest open before the older open one.
    expect(newestOpen).toBeGreaterThanOrEqual(0);
    expect(newestOpen).toBeLessThan(olderOpen);
    // Every open row precedes every resolved row.
    expect(olderOpen).toBeLessThan(recentResolvedIdx);
    // Resolved rows are newest first too.
    expect(recentResolvedIdx).toBeLessThan(oldResolvedIdx);
  });

  it('resolves an open event with a note through the same repository call the banner uses', async () => {
    const event = await harness.repos.safety.create({
      date: '2026-09-08',
      kind: 'pain',
      text: 'Knee twinge during squats',
      source: 'session',
    });

    renderPanel();
    await screen.findByText('Knee twinge during squats');

    fireEvent.click(screen.getByRole('button', { name: 'Resolve' }));
    fireEvent.change(screen.getByLabelText(/Resolution note/i), {
      target: { value: 'Backed off the depth; feels fine now.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm resolved' }));

    await waitFor(async () => {
      const stored = await harness.repos.safety.get(event.id);
      expect(stored?.resolvedAt).not.toBeNull();
    });

    const stored = await harness.repos.safety.get(event.id);
    expect(stored?.note).toBe('Backed off the depth; feels fine now.');

    // The row moves out of "open" — no Resolve button left, and it reads as resolved.
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Resolve' })).toBeNull();
    });
    expect(screen.getByText(/^Resolved /)).toBeTruthy();
  });
});

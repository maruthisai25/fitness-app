/**
 * Profile panel component test — DESIGN.md §4.1 `profile.birthDate`, §5.6.
 *
 * Age is one of the four numbers in Mifflin-St Jeor. Until the web shell had a
 * birth-date field, `profile.birthDate` stayed null for ever on this shell and
 * every computed calorie target quietly used the default age instead — the
 * rationale said `ageSource: 'default'` and nothing on screen could change it.
 */

import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createHarness, renderWithProviders, type Harness } from '../testing/harness';
import { ProfilePanel } from './ProfilePanel';

let harness: Harness;

beforeEach(async () => {
  harness = await createHarness();
});

afterEach(async () => {
  cleanup();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await harness.db.close();
});

describe('You → Profile', () => {
  it('saves a birth date as a LocalDate', async () => {
    renderWithProviders(harness, <ProfilePanel />);

    const birthDate = await screen.findByLabelText(/birth date/i);
    fireEvent.change(birthDate, { target: { value: '1990-05-14' } });
    fireEvent.change(screen.getByLabelText(/^sex$/i), { target: { value: 'female' } });
    fireEvent.click(screen.getByRole('button', { name: /save profile/i }));

    await waitFor(async () => {
      expect((await harness.repos.profile.get())?.birthDate).toBe('1990-05-14');
    });
    expect((await harness.repos.profile.get())?.sex).toBe('female');
  });

  it('reads an existing birth date back into the form and can clear it', async () => {
    await harness.repos.profile.update({ birthDate: '1988-01-02' });

    renderWithProviders(harness, <ProfilePanel />);

    const birthDate = await screen.findByLabelText<HTMLInputElement>(/birth date/i);
    await waitFor(() => expect(birthDate.value).toBe('1988-01-02'));

    fireEvent.change(birthDate, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /save profile/i }));

    // Blank means "would rather not say", which is null in the row — not ''.
    await waitFor(async () => {
      expect((await harness.repos.profile.get())?.birthDate).toBeNull();
    });
  });
});

import { expect, test, type Page } from '@playwright/test';

/**
 * Web smoke tests — DESIGN.md §10: "Playwright smoke test for web (onboard →
 * log workout → see PR)", extended per the accessibility/e2e pass to also
 * cover food logging and the coach's no-key state (DESIGN.md §9 phase 7).
 *
 * OPFS requires a secure context. Playwright's `http://localhost` origin
 * counts as one, so this runs against the built preview server (see
 * `playwright.config.ts`) without any special headers.
 *
 * Every test starts from a fresh browser context (Playwright's default), so
 * each one walks onboarding itself via `completeOnboarding` — there is no
 * persisted profile to share between tests.
 */

/** Walks the six onboarding steps with the defaults, ending on the main shell. */
async function completeOnboarding(page: Page): Promise<void> {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Welcome to VigorEngine' })).toBeVisible();
  await page.getByLabel('I understand and accept this.').check();
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('heading', { name: 'Profile basics' })).toBeVisible();
  await page.getByPlaceholder('Athlete').fill('Test Athlete');
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('heading', { name: 'Goals' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('heading', { name: 'Equipment' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('heading', { name: 'Duration & style' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('heading', { name: 'Anthropic API key' })).toBeVisible();
  await page.getByRole('button', { name: 'Finish' }).click();

  await expect(page.getByRole('link', { name: 'Today' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'You' })).toBeVisible();
}

/** The sidebar's five destinations (DESIGN.md §7.1) — scoped so a click on
 * "Eat" or "Train" here never matches another link that merely mentions the
 * word (e.g. Today's "Open the Eat tab" card link). */
function primaryNav(page: Page) {
  return page.getByRole('navigation', { name: 'Primary' });
}

test('completes onboarding and reaches the main shell', async ({ page }) => {
  await completeOnboarding(page);

  // DESIGN.md §9 phase 2: the coach panel is reachable from every screen, and
  // shows a typed offline/no-key state instead of crashing when onboarding
  // skipped the API key step.
  const coachPanel = page.getByRole('complementary', { name: 'Coach chat' });
  await expect(coachPanel).toBeVisible();
  await expect(coachPanel.getByText(/needs an API key/i)).toBeVisible();
});

test('builds a workout, completes a set in session mode, logs food, and sees the coach no-key state', async ({
  page,
}) => {
  await completeOnboarding(page);

  // ---------------------------------------------------------------------
  // Train: a manual workout with one exercise, completed in session mode,
  // ends with a personal record on the finish summary.
  // ---------------------------------------------------------------------
  await test.step('build a one-exercise workout', async () => {
    await primaryNav(page).getByRole('link', { name: 'Train', exact: true }).click();
    await page.getByRole('link', { name: 'Build a workout' }).click();

    // The planner's draft loads asynchronously; wait for the real form
    // rather than its "Starting from the planner's draft…" placeholder.
    const addExercise = page.getByLabel('Add an exercise');
    await expect(addExercise).toBeVisible();

    // Whatever the rule-based planner drafted from the profile's default
    // bodyweight equipment, clear it — this workout is exactly one exercise.
    const removeButtons = page.getByRole('button', { name: /^Remove /i });
    while ((await removeButtons.count()) > 0) {
      await removeButtons.first().click();
    }

    await addExercise.selectOption({ label: 'Barbell Back Squat' });
    await expect(page.getByRole('heading', { name: '1. Barbell Back Squat' })).toBeVisible();

    // One set only, at a load new enough to guarantee a personal record.
    await page.getByLabel('Sets').fill('1');
    await page.getByLabel('Load (kg)').fill('60');

    await page.getByRole('button', { name: 'Save and start' }).click();
  });

  await test.step('complete the set in session mode and see a PR', async () => {
    await expect(page.getByRole('heading', { name: 'Barbell Back Squat' })).toBeVisible();

    await page.getByLabel('Set 1 reps').fill('5');
    const loadField = page.getByLabel('Set 1 load in kg');
    await loadField.fill('60');
    // Accessibility pass: Enter in the load box confirms the set, same as
    // clicking "Confirm set 1" — DESIGN.md's "full keyboard operation of
    // session mode" requirement, exercised for real here (not jsdom).
    await loadField.press('Enter');

    // The set confirmed and rest started (DESIGN.md §7.1 rest timer).
    await expect(page.getByRole('timer')).toBeVisible();

    await page.getByRole('button', { name: 'Finish session' }).click();

    await expect(page.getByRole('heading', { level: 1 })).toContainText('done');
    await expect(page.getByText(/New personal record/i)).toBeVisible();
    await expect(page.getByText('Barbell Back Squat · Estimated 1RM')).toBeVisible();

    // The finish summary is its own full-screen flow, outside the sidebar
    // shell (DESIGN.md §7.1) — back to Today to reach the rest of the app.
    await page.getByRole('link', { name: 'Back to Today' }).click();
    await expect(primaryNav(page).getByRole('link', { name: 'Eat', exact: true })).toBeVisible();
  });

  // ---------------------------------------------------------------------
  // Eat: a manual food log changes the day's totals.
  // ---------------------------------------------------------------------
  await test.step('log a food item manually and see the day totals change', async () => {
    await primaryNav(page).getByRole('link', { name: 'Eat', exact: true }).click();
    await expect(page.getByText(/Nothing logged for this day yet/i)).toBeVisible();

    await page
      .getByRole('navigation', { name: 'Eat sections' })
      .getByRole('link', { name: 'Add food' })
      .click();
    await page.getByRole('button', { name: 'Type the numbers', exact: true }).click();

    await page.getByLabel('Food').fill('Grilled chicken breast');
    await page.getByLabel('Calories (kcal)').fill('280');
    await page.getByLabel('Protein (g)').fill('42');
    await page.getByRole('button', { name: 'Log this item' }).click();

    // Logging navigates back to the day view (DESIGN.md §7.1 "day log by
    // meal") with the new item and its meal-slot total in place of the
    // empty state.
    await expect(page.getByText(/Nothing logged for this day yet/i)).not.toBeVisible();
    await expect(page.getByText('Grilled chicken breast').first()).toBeVisible();
    await expect(page.getByText(/280 kcal · 42 g protein/)).toBeVisible();
  });

  // ---------------------------------------------------------------------
  // Coach: reachable throughout, and honest about having no API key.
  // ---------------------------------------------------------------------
  await test.step('open the coach panel and see the no-key state', async () => {
    const coachPanel = page.getByRole('complementary', { name: 'Coach chat' });
    await expect(coachPanel).toBeVisible();
    await expect(coachPanel.getByText(/needs an API key/i)).toBeVisible();
    await expect(coachPanel.getByLabel('Message the coach')).toBeDisabled();
  });
});

import { expect, test } from '@playwright/test';

/**
 * Smoke test — DESIGN.md §10: "Playwright smoke test for web (onboard → log
 * workout → see PR)". This covers the onboard leg; workout logging and PRs
 * land with the Train tab (DESIGN.md §9 phase 1).
 *
 * OPFS requires a secure context. Playwright's `http://localhost` origin
 * counts as one, so this runs against the built preview server (see
 * `playwright.config.ts`) without any special headers.
 */
test('completes onboarding and reaches the main shell', async ({ page }) => {
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
});

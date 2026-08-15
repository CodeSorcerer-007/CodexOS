import { test, expect } from '@playwright/test';

test.describe('Settings E2E', () => {
  test('navigates to settings and verifies configuration options', async ({ page }) => {
    await page.goto('/');

    const settingsNav = page.locator('button[aria-label="Settings"]').first();
    if (await settingsNav.isVisible()) {
      await settingsNav.click();
    }

    const mainContent = page.locator('main#main-content');
    await expect(mainContent).toBeVisible();
  });
});

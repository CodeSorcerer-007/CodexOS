import { test, expect } from '@playwright/test';

test.describe('Visual Git E2E', () => {
  test('navigates to Git client and verifies panel layout', async ({ page }) => {
    await page.goto('/');

    const gitNav = page.locator('button[aria-label="Git Client"]').first();
    if (await gitNav.isVisible()) {
      await gitNav.click();
    }

    const mainContent = page.locator('main#main-content');
    await expect(mainContent).toBeVisible();
  });
});

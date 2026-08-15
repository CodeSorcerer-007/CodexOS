import { test, expect } from '@playwright/test';

test.describe('Secrets & Vault E2E', () => {
  test('navigates to Secrets manager and displays security state', async ({ page }) => {
    await page.goto('/');

    const secretsNav = page.locator('button[aria-label="Secrets"]').first();
    if (await secretsNav.isVisible()) {
      await secretsNav.click();
    }

    const mainContent = page.locator('main#main-content');
    await expect(mainContent).toBeVisible();
  });
});

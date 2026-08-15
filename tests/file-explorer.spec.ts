import { test, expect } from '@playwright/test';

test.describe('File Explorer E2E', () => {
  test('navigates to files view and renders workspace elements', async ({ page }) => {
    await page.goto('/');

    // Click on Vaults / Files button in sidebar
    const filesNav = page.locator('button[aria-label="Vaults"]').first();
    if (await filesNav.isVisible()) {
      await filesNav.click();
    }

    // Verify main content area is present
    const mainContent = page.locator('main#main-content');
    await expect(mainContent).toBeVisible();
  });
});

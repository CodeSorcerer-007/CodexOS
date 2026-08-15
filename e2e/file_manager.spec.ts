import { test, expect } from '@playwright/test';

test.describe('CodexOS File Manager', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('can open files app and view "This PC"', async ({ page }) => {
    const filesTabBtn = page.locator('button[title="Files"]');
    await filesTabBtn.click();
    
    // We should see "Devices and drives" for This PC by default
    await expect(page.locator('text=Devices and drives')).toBeVisible({ timeout: 5000 });
  });

  test('can use tab navigation', async ({ page }) => {
    // Click the new tab button
    await page.keyboard.press('Control+t');
    
    // We should see two dashboard tabs
    await expect(page.locator('text=Dashboard').nth(1)).toBeVisible();
    
    // Close tab
    await page.keyboard.press('Control+w');
    await expect(page.locator('text=Dashboard').nth(1)).not.toBeVisible();
  });
});

import { test, expect } from '@playwright/test';

test.describe('Settings & Configuration Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('opens command palette and searches settings', async ({ page }) => {
    await page.keyboard.press('Control+k');
    const input = page.locator('input[placeholder*="Search commands"]');
    await expect(input).toBeVisible();
    await input.fill('Settings');
    const option = page.locator('text=Settings').first();
    await expect(option).toBeVisible();
  });
});

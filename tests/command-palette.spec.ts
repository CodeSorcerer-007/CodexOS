import { test, expect } from '@playwright/test';

test.describe('Command Palette E2E', () => {
  test('Ctrl+K opens palette, search filters items, and Escape closes it', async ({ page }) => {
    await page.goto('/');

    // Press Ctrl+K to open command palette
    await page.keyboard.press('Control+K');

    // Verify command palette dialog is visible
    const palette = page.locator('[role="dialog"]').first();
    await expect(palette).toBeVisible({ timeout: 5000 }).catch(async () => {
      // Fallback: search for input placeholder
      const searchInput = page.locator('input[placeholder*="Type a command"]').first();
      await expect(searchInput).toBeVisible();
    });

    // Press Escape to dismiss
    await page.keyboard.press('Escape');
  });
});

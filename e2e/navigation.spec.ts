import { test, expect } from '@playwright/test';

test.describe('CodexOS Navigation & Layout', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('loads home dashboard with title and titlebar controls', async ({ page }) => {
    await expect(page).toHaveTitle(/CodexOS/);
    const minimizeBtn = page.locator('button[title="Minimize"]');
    await expect(minimizeBtn).toBeVisible();
  });

  test('displays floating sidebar with navigation items', async ({ page }) => {
    const sidebar = page.locator('aside');
    await expect(sidebar).toBeVisible();
  });

  test('can open and close command palette', async ({ page }) => {
    // Open via shortcut
    await page.keyboard.press('Control+k');
    const palette = page.locator('input[placeholder*="Search commands"]');
    await expect(palette).toBeVisible({ timeout: 5000 });

    // Close via Escape
    await page.keyboard.press('Escape');
    await expect(palette).not.toBeVisible();
  });
});

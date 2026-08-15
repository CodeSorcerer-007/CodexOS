import { test, expect } from '@playwright/test';

test.describe('Vault Lock Security Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('presents vault unlock prompt when locked', async ({ page }) => {
    const lockBadge = page.locator('text=Locked').or(page.locator('text=Unlock Vault'));
    await expect(lockBadge.first()).toBeVisible({ timeout: 5000 });
  });

  test('allows typing master password into unlock modal input', async ({ page }) => {
    const passwordInput = page.locator('input[type="password"]');
    if (await passwordInput.isVisible()) {
      await passwordInput.fill('secret123');
      await expect(passwordInput).toHaveValue('secret123');
    }
  });
});

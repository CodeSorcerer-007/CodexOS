import { test } from '@playwright/test';

test('dashboard matches snapshot', async ({ page }) => {
  await page.goto('/');
  // await expect(page).toHaveScreenshot('dashboard.png', { threshold: 0.01 });
});

test('vault unlock modal matches snapshot', async ({ page }) => {
  await page.goto('/');
  // trigger vault unlock modal
  // await expect(page.locator('[data-testid="vault-unlock"]'))
  //  .toHaveScreenshot('vault-unlock.png');
});

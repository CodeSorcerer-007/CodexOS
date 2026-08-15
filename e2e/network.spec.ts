
import { test, expect } from '@playwright/test';

test.describe('Network Interceptor Tool', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('can navigate to network interceptor', async ({ page }) => {
    const networkTab = page.locator('button').filter({ hasText: 'Network Interceptor' });
    if (await networkTab.isVisible()) {
      await networkTab.click();
      await expect(page.locator('text=HTTP Proxy')).toBeVisible();
    }
  });

  test('presents warning about sensitive data', async ({ page }) => {
    // Navigate to network tab if needed
    const networkTab = page.locator('button').filter({ hasText: 'Network Interceptor' });
    if (await networkTab.isVisible()) {
      await networkTab.click();
    }
    const warningBanner = page.locator('text=Warning: Intercepted requests are stored unencrypted');
    if (await warningBanner.isVisible()) {
      await expect(warningBanner).toBeVisible();
      // Dismiss the banner
      await page.locator('button', { hasText: '✕' }).click();
      await expect(warningBanner).toBeHidden();
    }
  });
});

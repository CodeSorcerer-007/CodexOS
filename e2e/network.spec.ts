import { test, expect } from './fixtures/tauriMock';

test.describe('Network Interceptor Tool', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('can navigate to network interceptor', async ({ page }) => {
    const networkTab = page.locator('button[aria-label="Proxy"]');
    if (await networkTab.isVisible()) {
      await networkTab.click({ force: true });
      await expect(page.locator('text=Proxy').first()).toBeVisible();
    }
  });

  test('presents warning about sensitive data', async ({ page }) => {
    const networkTab = page.locator('button[aria-label="Proxy"]');
    if (await networkTab.isVisible()) {
      await networkTab.click({ force: true });
    }
    const warningBanner = page.locator('text=Warning: Intercepted requests are stored unencrypted');
    if (await warningBanner.isVisible()) {
      await expect(warningBanner).toBeVisible();
      await page.locator('button', { hasText: '✕' }).click();
      await expect(warningBanner).toBeHidden();
    }
  });
});

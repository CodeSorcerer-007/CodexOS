import { test, expect } from './fixtures/tauriMock';

test.describe('Tauri IPC Integration', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('IPC invokes without fatal errors on mount', async ({ page }) => {
    const dashboard = page.locator('.flex.h-screen');
    await expect(dashboard).toBeVisible();
  });
  
  test('IPC mock handles list_tunnels gracefully', async ({ page }) => {
    const tunnelsTab = page.locator('button').filter({ hasText: 'Tunnel Manager' });
    if (await tunnelsTab.isVisible()) {
      await tunnelsTab.click();
      await expect(page.locator('text=Active Tunnels')).toBeVisible();
    }
  });
});

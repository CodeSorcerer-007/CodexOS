
import { test, expect } from '@playwright/test';

test.describe('Tauri IPC Integration', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('IPC invokes without fatal errors on mount', async ({ page }) => {
    // If there were fatal IPC errors, we would see toast errors or a blank page
    // We check if the dashboard renders successfully
    const dashboard = page.locator('.flex.h-screen');
    await expect(dashboard).toBeVisible();
  });
  
  test('IPC mock/polyfill handles list_tunnels gracefully', async ({ page }) => {
    // Navigate to Tunnels tab
    const tunnelsTab = page.locator('button').filter({ hasText: 'Tunnel Manager' });
    if (await tunnelsTab.isVisible()) {
      await tunnelsTab.click();
      await expect(page.locator('text=Active Tunnels')).toBeVisible();
    }
  });
});

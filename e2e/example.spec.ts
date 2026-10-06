import { test, expect } from './fixtures/tauriMock';

test('has title', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/CodexOS/);
});

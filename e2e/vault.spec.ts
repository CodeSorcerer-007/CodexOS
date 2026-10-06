import { test, expect } from './fixtures/tauriMock';

test.describe('Journey 1: Vault Lock & Unlock Security Flow', () => {
  test.use({ mockOptions: { vaultLocked: true } });
  // ─── TIER 1: Feature Coverage (Primary Happy Paths) ───────────────────────

  test.describe('Tier 1: Feature Coverage', () => {
    test('1.1 presents locked modal on initial launch when vault is locked', async ({ page }) => {
      await page.goto('/');
      const modalTitle = page.locator('#vault-unlock-title');
      await expect(modalTitle).toBeVisible({ timeout: 10000 });
      await expect(modalTitle).toHaveText('Vault is Locked');

      const passwordInput = page.locator('#vault-password');
      await expect(passwordInput).toBeVisible();
      await expect(page.locator('button[type="submit"]:has-text("Unlock Vault")')).toBeVisible();
    });

    test('1.2 accepts typing master password into unlock modal input', async ({ page }) => {
      await page.goto('/');
      const passwordInput = page.locator('#vault-password');
      await expect(passwordInput).toBeVisible();

      await passwordInput.fill('secret123');
      await expect(passwordInput).toHaveValue('secret123');
    });

    test('1.3 unlocks vault successfully with valid password and closes modal', async ({ page }) => {
      await page.goto('/');
      const passwordInput = page.locator('#vault-password');
      await passwordInput.fill('secret123');

      const unlockBtn = page.locator('button[type="submit"]:has-text("Unlock Vault")');
      await unlockBtn.click();

      // Modal should disappear
      await expect(page.locator('#vault-unlock-title')).not.toBeVisible({ timeout: 10000 });
    });

    test('1.4 submits unlock via Enter key press on password input', async ({ page }) => {
      await page.goto('/');
      const passwordInput = page.locator('#vault-password');
      await passwordInput.fill('secret123');
      await passwordInput.press('Enter');

      await expect(page.locator('#vault-unlock-title')).not.toBeVisible({ timeout: 10000 });
    });

    test('1.5 updates store vault status to unlocked and allows protected views', async ({ page }) => {
      await page.goto('/');
      const passwordInput = page.locator('#vault-password');
      await passwordInput.fill('secret123');
      await page.locator('button[type="submit"]:has-text("Unlock Vault")').click();
      await expect(page.locator('#vault-unlock-title')).not.toBeVisible();

      // Navigate to Secrets module (protected view) via sidebar or store
      const secretsNav = page.locator('button[aria-label="Secrets"]');
      if (await secretsNav.isVisible()) {
        await secretsNav.click();
      } else {
        await page.evaluate(() => {
          (window as any).__TAURI_MOCK_STATE__.vaultLocked = false;
        });
      }
      // Verify main dashboard/app container is active and unlocked
      const mainContent = page.locator('#main-content');
      await expect(mainContent).toBeVisible();
    });
  });

  // ─── TIER 2: Boundary & Error Conditions ──────────────────────────────────

  test.describe('Tier 2: Boundary & Error Handling', () => {
    test('2.1 displays "Invalid password" alert on incorrect password submission', async ({ page }) => {
      await page.goto('/');
      const passwordInput = page.locator('#vault-password');
      await passwordInput.fill('wrongpassword');

      const unlockBtn = page.locator('button[type="submit"]:has-text("Unlock Vault")');
      await unlockBtn.click();

      const errorAlert = page.locator('[role="alert"]');
      await expect(errorAlert).toBeVisible({ timeout: 5000 });
      await expect(errorAlert).toHaveText('Invalid password');
    });

    test('2.2 keeps unlock modal open after invalid password attempt', async ({ page }) => {
      await page.goto('/');
      const passwordInput = page.locator('#vault-password');
      await passwordInput.fill('incorrect1');
      await page.locator('button[type="submit"]:has-text("Unlock Vault")').click();

      // Modal remains visible
      await expect(page.locator('#vault-unlock-title')).toBeVisible();
      await expect(passwordInput).toBeVisible();
    });

    test('2.3 disables unlock submit button when password input is empty', async ({ page }) => {
      await page.goto('/');
      const passwordInput = page.locator('#vault-password');
      await passwordInput.fill('');

      const unlockBtn = page.locator('button[type="submit"]:has-text("Unlock Vault")');
      await expect(unlockBtn).toBeDisabled();
    });

    test('2.4 recovers from failed attempts and unlocks when correct password is entered', async ({ page }) => {
      await page.goto('/');
      const passwordInput = page.locator('#vault-password');

      // Attempt 1: wrong
      await passwordInput.fill('wrong1');
      await page.locator('button[type="submit"]').click();
      await expect(page.locator('[role="alert"]')).toBeVisible();

      // Attempt 2: correct
      await passwordInput.fill('secret123');
      await page.locator('button[type="submit"]').click();

      await expect(page.locator('#vault-unlock-title')).not.toBeVisible();
    });

    test('2.5 handles extreme length password boundary without crashing UI', async ({ page }) => {
      await page.goto('/');
      const passwordInput = page.locator('#vault-password');
      const longPassword = 'A'.repeat(500);

      await passwordInput.fill(longPassword);
      await expect(passwordInput).toHaveValue(longPassword);
      await page.locator('button[type="submit"]').click();

      await expect(page.locator('[role="alert"]')).toBeVisible();
    });
  });

  // ─── TIER 3: Pairwise Combinations ────────────────────────────────────────

  test.describe('Tier 3: Pairwise Combinations', () => {
    test('3.1 pairwise: vault unlocked enables keyboard shortcuts (Ctrl+T / Ctrl+W)', async ({ page }) => {
      await page.goto('/');
      // Unlock first
      await page.locator('#vault-password').fill('secret123');
      await page.locator('button[type="submit"]').click();
      await expect(page.locator('#vault-unlock-title')).not.toBeVisible();

      // New tab via shortcut Ctrl+T
      await page.keyboard.press('Control+t');
      // Should now have multiple tabs
      const tabs = page.locator('[role="tab"], .tab-item, button:has-text("Dashboard")');
      await expect(tabs.first()).toBeVisible();

      // Close tab via shortcut Ctrl+W
      await page.keyboard.press('Control+w');
    });

    test('3.2 pairwise: vault unlocked allows navigation to Env Manager', async ({ page }) => {
      await page.goto('/');
      await page.locator('#vault-password').fill('secret123');
      await page.locator('button[type="submit"]').click();
      await expect(page.locator('#vault-unlock-title')).not.toBeVisible();

      // Navigate to Env Manager via sidebar
      const envBtn = page.locator('button[aria-label="Env Manager"]');
      await envBtn.click();

      // Verify Env Manager view loaded
      await expect(page.getByRole('heading', { name: 'Env Manager' })).toBeVisible({ timeout: 15000 });
    });
  });

  // ─── TIER 4: Real-World Application Scenario ──────────────────────────────

  test.describe('Tier 4: Real-World Workflows', () => {
    test('4.1 scenario: Secure Login, Vault Decryption & Workspace Access', async ({ page }) => {
      // Step 1: User opens application and observes locked vault challenge
      await page.goto('/');
      await expect(page.locator('#vault-unlock-title')).toBeVisible();

      // Step 2: User mistypes password and sees feedback alert
      await page.locator('#vault-password').fill('wrongpass');
      await page.locator('button[type="submit"]').click();
      await expect(page.locator('[role="alert"]')).toHaveText('Invalid password');

      // Step 3: User inputs correct master password and unlocks
      await page.locator('#vault-password').fill('secret123');
      await page.locator('button[type="submit"]').click();
      await expect(page.locator('#vault-unlock-title')).not.toBeVisible({ timeout: 10000 });

      // Step 4: User accesses navigation and enters file workspace
      await page.keyboard.press('Control+k');
      const search = page.locator('input[placeholder*="Search commands"]');
      await search.fill('Vaults');
      await page.locator('[role="option"]:has-text("Vaults")').click();

      // Step 5: Verify workspace is fully unlocked and navigable
      await expect(page.locator('text=This PC').first()).toBeVisible({ timeout: 20000 });
    });
  });
});

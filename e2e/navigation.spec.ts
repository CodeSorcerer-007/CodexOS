import { test, expect } from './fixtures/tauriMock';

test.describe('Journey 5: Command Palette Navigation', () => {
  test.use({
    mockOptions: {
      vaultLocked: false,
      currentPath: 'C:/workspace',
    },
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Move mouse away from center so it does not trigger hover on palette results
    await page.mouse.move(0, 0);
    await expect(page.locator('text=Loading Module...')).not.toBeVisible({ timeout: 30000 });
  });

  // ─── TIER 1: Feature Coverage (Primary Happy Paths) ───────────────────────

  test.describe('Tier 1: Feature Coverage', () => {
    test('1.1 renders application window, titlebar controls, and home dashboard', async ({ page }) => {
      await expect(page).toHaveTitle(/CodexOS/);
      // Title bar window controls
      await expect(page.locator('button[title="Minimize"]')).toBeVisible();
      await expect(page.locator('button[title="Maximize"]')).toBeVisible();
      await expect(page.locator('button[title="Close"]')).toBeVisible();

      // Home welcome message
      await expect(page.locator('h1:has-text("Welcome to CodexOS")')).toBeVisible();
    });

    test('1.2 displays floating sidebar navigation items with accessible labels', async ({ page }) => {
      const sidebar = page.locator('nav[aria-label="Main navigation"]');
      await expect(sidebar).toBeVisible();

      // Key module buttons present
      await expect(page.locator('button[aria-label="Dashboard"]')).toBeVisible();
      await expect(page.locator('button[aria-label="Vaults"]')).toBeVisible();
      await expect(page.locator('button[aria-label="Terminal"]')).toBeVisible();
      await expect(page.locator('button[aria-label="Git Client"]')).toBeVisible();
    });

    test('1.3 opens Command Palette dialog using Control+K keyboard shortcut', async ({ page }) => {
      // Trigger Control+K shortcut
      await page.keyboard.press('Control+k');

      // Command palette dialog should be visible
      const dialog = page.locator('div[role="dialog"][aria-label="Command palette"]');
      await expect(dialog).toBeVisible({ timeout: 5000 });

      // Search input should be auto-focused
      const input = page.locator('input[placeholder*="Search commands"]');
      await expect(input).toBeVisible();
      await expect(input).toBeFocused();
    });

    test('1.4 filters and searches command options by query', async ({ page }) => {
      await page.keyboard.press('Control+k');
      const input = page.locator('input[placeholder*="Search commands"]');
      await input.fill('Terminal');

      // Results container contains Terminal option
      const results = page.locator('#command-palette-results');
      await expect(results.locator('text=Terminal')).toBeVisible();

      // Non-matching options like Dashboard should be filtered out
      await expect(results.locator('text=Dashboard')).not.toBeVisible();
    });

    test('1.5 navigates to module via keyboard Enter key on active option', async ({ page }) => {
      await page.keyboard.press('Control+k');
      const input = page.locator('input[placeholder*="Search commands"]');
      await input.fill('Terminal');

      // Wait for filtered option to be ready and selected
      const option = page.locator('#command-palette-results div[role="option"]:has-text("Terminal")');
      await expect(option).toBeVisible();
      await expect(option).toHaveAttribute('aria-selected', 'true', { timeout: 5000 });

      // Press Enter to select top filtered item
      await page.keyboard.press('Enter');

      // Command palette closes
      await expect(page.locator('div[role="dialog"][aria-label="Command palette"]')).not.toBeVisible();

      // Terminal Multiplexer renders
      await expect(page.locator('h2:has-text("Terminal Multiplexer")')).toBeVisible({ timeout: 15000 });
    });
  });

  // ─── TIER 2: Boundary & Error Handling ────────────────────────────────────

  test.describe('Tier 2: Boundary & Error Handling', () => {
    test('2.1 closes Command Palette when Escape key is pressed', async ({ page }) => {
      await page.keyboard.press('Control+k');
      const dialog = page.locator('div[role="dialog"][aria-label="Command palette"]');
      await expect(dialog).toBeVisible();

      // Press Escape
      await page.keyboard.press('Escape');

      // Modal closed
      await expect(dialog).not.toBeVisible({ timeout: 5000 });
    });

    test('2.2 closes Command Palette when clicking outside dialog backdrop', async ({ page }) => {
      await page.keyboard.press('Control+k');
      const dialog = page.locator('div[role="dialog"][aria-label="Command palette"]');
      await expect(dialog).toBeVisible();

      // Click the backdrop overlay at top edge
      await dialog.click({ position: { x: 10, y: 10 } });

      // Modal closed
      await expect(dialog).not.toBeVisible({ timeout: 5000 });
    });

    test('2.3 displays "No results found" empty state for unrecognised queries', async ({ page }) => {
      await page.keyboard.press('Control+k');
      const input = page.locator('input[placeholder*="Search commands"]');
      await input.fill('xyz_nonexistent_command_123');

      // Status message displayed
      const noResults = page.locator('div[role="status"]:has-text("No results found for \\"xyz_nonexistent_command_123\\"")');
      await expect(noResults).toBeVisible({ timeout: 5000 });
    });

    test('2.4 navigates options list using ArrowDown and ArrowUp keys updating selection', async ({ page }) => {
      await page.keyboard.press('Control+k');
      const results = page.locator('#command-palette-results');
      const options = results.locator('div[role="option"]');
      await expect(options.first()).toBeVisible();

      // Initial first item is selected
      await expect(options.first()).toHaveAttribute('aria-selected', 'true', { timeout: 5000 });

      // Press ArrowDown to advance selection
      await page.keyboard.press('ArrowDown');
      await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true');

      // Press ArrowUp to revert selection
      await page.keyboard.press('ArrowUp');
      await expect(options.first()).toHaveAttribute('aria-selected', 'true');
    });

    test('2.5 navigates to module by clicking an option directly', async ({ page }) => {
      await page.keyboard.press('Control+k');
      const input = page.locator('input[placeholder*="Search commands"]');
      await input.fill('Git Client');

      // Click Git Client option directly
      const option = page.locator('#command-palette-results div[role="option"]:has-text("Git Client")');
      await option.click({ force: true });

      // Dialog closes and Git Client mounts
      await expect(page.locator('div[role="dialog"][aria-label="Command palette"]')).not.toBeVisible();
      await expect(page.locator('h2:has-text("Source Control")')).toBeVisible({ timeout: 15000 });
    });
  });

  // ─── TIER 3: Pairwise Combinations ────────────────────────────────────────

  test.describe('Tier 3: Pairwise Combinations', () => {
    test('3.1 pairwise: navigates to Vaults/FileGrid via Command Palette and verifies view mounts', async ({ page }) => {
      await page.keyboard.press('Control+k');
      const input = page.locator('input[placeholder*="Search commands"]');
      await input.fill('Vaults');

      const option = page.locator('#command-palette-results div[role="option"]:has-text("Vaults")');
      await expect(option).toBeVisible();
      await expect(option).toHaveAttribute('aria-selected', 'true', { timeout: 5000 });
      await page.keyboard.press('Enter');

      // File workspace / vaults view is active
      await expect(page.locator('div[role="dialog"][aria-label="Command palette"]')).not.toBeVisible();
      await expect(page.locator('button[aria-label="Vaults"][aria-current="page"]')).toBeVisible({ timeout: 15000 });
    });

    test('3.2 pairwise: searches and switches workspace via recent workspace command item', async ({ page }) => {
      await page.keyboard.press('Control+k');
      const input = page.locator('input[placeholder*="Search commands"]');
      await input.fill('Switch Workspace: Demo Project');

      // Option present in results
      const wsOption = page.locator('#command-palette-results div[role="option"]:has-text("Switch Workspace: Demo Project")');
      await expect(wsOption).toBeVisible({ timeout: 5000 });
      await page.keyboard.press('Enter');

      // Navigates to files in selected workspace
      await expect(page.locator('div[role="dialog"][aria-label="Command palette"]')).not.toBeVisible();
      await expect(page.locator('button[aria-label="Vaults"][aria-current="page"]')).toBeVisible({ timeout: 15000 });
    });
  });

  // ─── TIER 4: Real-World Workflows ──────────────────────────────────────

  test.describe('Tier 4: Real-World Workflows', () => {
    test('4.1 scenario: Rapid Multi-Module Developer Navigation Workflow via Omnibox', async ({ page }) => {
      // Step 1: Start at Dashboard
      await expect(page.locator('h1:has-text("Welcome to CodexOS")')).toBeVisible();

      // Step 2: Quick hop to Terminal via Control+K
      await page.keyboard.press('Control+k');
      await page.locator('input[placeholder*="Search commands"]').fill('Terminal');
      const termOption = page.locator('#command-palette-results div[role="option"]:has-text("Terminal")');
      await expect(termOption).toBeVisible();
      await expect(termOption).toHaveAttribute('aria-selected', 'true', { timeout: 5000 });
      await page.keyboard.press('Enter');
      await expect(page.locator('h2:has-text("Terminal Multiplexer")')).toBeVisible({ timeout: 15000 });

      // Step 3: Quick hop to Git Client via Control+K
      await page.keyboard.press('Control+k');
      await page.locator('input[placeholder*="Search commands"]').fill('Git Client');
      const gitOption = page.locator('#command-palette-results div[role="option"]:has-text("Git Client")');
      await expect(gitOption).toBeVisible();
      await expect(gitOption).toHaveAttribute('aria-selected', 'true', { timeout: 5000 });
      await page.keyboard.press('Enter');
      await expect(page.locator('h2:has-text("Source Control")')).toBeVisible({ timeout: 15000 });

      // Step 4: Quick hop back to Dashboard via Control+K
      await page.keyboard.press('Control+k');
      await page.locator('input[placeholder*="Search commands"]').fill('Dashboard');
      const dashOption = page.locator('#command-palette-results div[role="option"]:has-text("Dashboard")');
      await expect(dashOption).toBeVisible();
      await expect(dashOption).toHaveAttribute('aria-selected', 'true', { timeout: 5000 });
      await page.keyboard.press('Enter');
      await expect(page.locator('h1:has-text("Welcome to CodexOS")')).toBeVisible({ timeout: 15000 });
    });
  });
});

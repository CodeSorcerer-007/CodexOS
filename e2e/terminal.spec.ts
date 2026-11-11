import { test, expect } from './fixtures/tauriMock';

test.describe('Journey 3: Terminal Session Command Execution', () => {
  test.use({
    mockOptions: {
      vaultLocked: false,
    },
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Navigate to Terminal module
    const terminalNav = page.locator('button[aria-label="Terminal"]');
    await terminalNav.click({ force: true });
    await page.mouse.move(600, 300);
    await expect(page.locator('text=Loading Module...')).not.toBeVisible({ timeout: 30000 });
    await expect(page.locator('h2:has-text("Terminal Multiplexer")')).toBeVisible({ timeout: 15000 });
  });

  // ─── TIER 1: Feature Coverage (Primary Happy Paths) ───────────────────────

  test.describe('Tier 1: Feature Coverage', () => {
    test('1.1 renders Terminal Multiplexer header and controls', async ({ page }) => {
      await expect(page.locator('h2:has-text("Terminal Multiplexer")')).toBeVisible();
      await expect(page.locator('button:has-text("Split Vertical |")')).toBeVisible();
      await expect(page.locator('button:has-text("Split Horizontal -")')).toBeVisible();
    });

    test('1.2 initializes PTY session and renders xterm DOM container', async ({ page }) => {
      const xtermContainer = page.locator('.xterm');
      await expect(xtermContainer.first()).toBeVisible({ timeout: 10000 });
      await expect(page.locator('.xterm-screen').first()).toBeVisible();
    });

    test('1.3 receives and displays initial PTY shell prompt in terminal', async ({ page }) => {
      const xtermRows = page.locator('.xterm-rows').first();
      await expect(xtermRows).toBeVisible({ timeout: 10000 });
      await expect(xtermRows).toContainText('user@codexos:~$', { timeout: 10000 });
    });

    test('1.4 sends keyboard input and receives executed command output', async ({ page }) => {
      const xtermHelper = page.locator('.xterm-helper-textarea').first();
      await xtermHelper.focus();

      // Type command and press enter
      await page.keyboard.type('cargo build');
      await page.keyboard.press('Enter');

      // Verify output rendered in xterm
      const xtermRows = page.locator('.xterm-rows').first();
      await expect(xtermRows).toContainText('CodexOS command executed successfully', { timeout: 10000 });
    });

    test('1.5 adds multiplexed terminal pane using Split Vertical button', async ({ page }) => {
      // Initially 1 xterm container
      await expect(page.locator('.xterm')).toHaveCount(1);

      // Click Split Vertical
      await page.locator('button:has-text("Split Vertical |")').click({ force: true });

      // Now 2 xterm containers
      await expect(page.locator('.xterm')).toHaveCount(2, { timeout: 10000 });
    });
  });

  // ─── TIER 2: Boundary & Error Handling ────────────────────────────────────

  test.describe('Tier 2: Boundary & Error Handling', () => {
    test('2.1 adds horizontal split pane multiplying sessions', async ({ page }) => {
      await expect(page.locator('.xterm')).toHaveCount(1);

      await page.locator('button:has-text("Split Horizontal -")').click({ force: true });

      await expect(page.locator('.xterm')).toHaveCount(2, { timeout: 10000 });
    });

    test('2.2 closes secondary terminal pane reducing pane count', async ({ page }) => {
      await page.locator('button:has-text("Split Vertical |")').click({ force: true });
      await expect(page.locator('.xterm')).toHaveCount(2, { timeout: 10000 });

      // Close button appears when panes > 1
      const closeButton = page.locator('button.text-red-400:has-text("X")').first();
      await closeButton.click({ force: true });

      // Count reverts to 1
      await expect(page.locator('.xterm')).toHaveCount(1, { timeout: 10000 });
    });

    test('2.3 enforces maximum pane limit of 4 panes', async ({ page }) => {
      // Split to 2
      await page.locator('button:has-text("Split Vertical |")').click({ force: true });
      // Split to 3
      await page.locator('button:has-text("Split Horizontal -")').click({ force: true });
      // Split to 4
      await page.locator('button:has-text("Split Vertical |")').click({ force: true });
      await expect(page.locator('.xterm')).toHaveCount(4, { timeout: 10000 });

      // Attempting to split further should remain at 4
      await page.locator('button:has-text("Split Vertical |")').click({ force: true });
      await expect(page.locator('.xterm')).toHaveCount(4);
    });

    test('2.4 does not show close button when only single pane exists', async ({ page }) => {
      await expect(page.locator('.xterm')).toHaveCount(1);
      // Terminal pane close button should not be present
      await expect(page.locator('button.text-red-400:has-text("X")')).toHaveCount(0);
    });

    test('2.5 handles multi-command rapid execution cleanly', async ({ page }) => {
      const xtermHelper = page.locator('.xterm-helper-textarea').first();
      await xtermHelper.focus();

      // First command
      await page.keyboard.type('echo 1');
      await page.keyboard.press('Enter');

      // Second command immediately
      await page.keyboard.type('echo 2');
      await page.keyboard.press('Enter');

      const xtermRows = page.locator('.xterm-rows').first();
      await expect(xtermRows).toContainText('status 0', { timeout: 10000 });
    });
  });

  // ─── TIER 3: Pairwise Combinations ────────────────────────────────────────

  test.describe('Tier 3: Pairwise Combinations', () => {
    test('3.1 pairwise: split dual panes and type command in pane 1 independently', async ({ page }) => {
      await page.locator('button:has-text("Split Vertical |")').click({ force: true });
      await expect(page.locator('.xterm')).toHaveCount(2);

      // Focus first pane
      const firstHelper = page.locator('.xterm-helper-textarea').first();
      await firstHelper.focus();
      await page.keyboard.type('ls -la');
      await page.keyboard.press('Enter');

      // Verify first pane has execution output
      const firstRows = page.locator('.xterm-rows').first();
      await expect(firstRows).toContainText('CodexOS command executed successfully', { timeout: 10000 });
    });

    test('3.2 pairwise: navigate away from terminal and return, verifying session remains intact', async ({ page }) => {
      const xtermHelper = page.locator('.xterm-helper-textarea').first();
      await xtermHelper.focus();
      await page.keyboard.type('npm test');
      await page.keyboard.press('Enter');
      await expect(page.locator('.xterm-rows').first()).toContainText('command executed', { timeout: 10000 });

      // Switch to Dashboard
      await page.locator('button[aria-label="Dashboard"]').click({ force: true });
      await expect(page.locator('h1:has-text("Welcome to CodexOS")')).toBeVisible({ timeout: 10000 });

      // Switch back to Terminal
      await page.locator('button[aria-label="Terminal"]').click({ force: true });
      await expect(page.locator('h2:has-text("Terminal Multiplexer")')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('.xterm').first()).toBeVisible();
    });
  });

  // ─── TIER 4: Real-World Application Scenario ──────────────────────────────

  test.describe('Tier 4: Real-World Workflows', () => {
    test('4.1 scenario: CLI Developer Build Task Workflow', async ({ page }) => {
      // Step 1: Confirm terminal session prompt is ready
      const xtermRows = page.locator('.xterm-rows').first();
      await expect(xtermRows).toContainText('user@codexos:~$', { timeout: 10000 });

      // Step 2: Developer runs build task command
      const helper = page.locator('.xterm-helper-textarea').first();
      await helper.focus();
      await page.keyboard.type('cargo build --release');
      await page.keyboard.press('Enter');

      // Step 3: Verify build task completes with success status
      await expect(xtermRows).toContainText('CodexOS command executed successfully', { timeout: 10000 });

      // Step 4: Developer splits terminal pane to run test watcher in parallel
      await page.locator('button:has-text("Split Vertical |")').click({ force: true });
      await expect(page.locator('.xterm')).toHaveCount(2);

      // Step 5: Second pane boots independently and displays shell prompt
      const secondRows = page.locator('.xterm-rows').nth(1);
      await expect(secondRows).toContainText('user@codexos:~$', { timeout: 10000 });
    });
  });
});

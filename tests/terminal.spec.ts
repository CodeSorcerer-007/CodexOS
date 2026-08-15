import { test, expect } from '@playwright/test';

test.describe('Terminal E2E', () => {
  test('xterm.js loads and renders correctly', async ({ page }) => {
    // Navigating to the local dev server. In a real Tauri environment,
    // Playwright would connect via the Tauri driver, but we assume
    // standard web preview for E2E frontend verification here.
    await page.goto('http://localhost:1420');

    // Click on the terminal tab or app icon
    // Assuming there's a button with an aria-label or text for Terminal
    await page.click('button[title="Terminal"]');

    // Wait for the xterm canvas or terminal container to be visible
    const terminalElement = page.locator('.xterm').first();
    await expect(terminalElement).toBeVisible();

    // Ensure the terminal has a canvas
    const canvas = terminalElement.locator('canvas').first();
    await expect(canvas).toBeVisible();
    
    // Type a simple command (e.g. echo)
    const textarea = terminalElement.locator('textarea');
    await textarea.focus();
    await textarea.type('echo Hello E2E Test\r');

    // Verify output - Note that in xterm.js, text is painted on canvas or rendered in xterm-rows
    const terminalRows = terminalElement.locator('.xterm-rows');
    await expect(terminalRows).toContainText('Hello E2E Test');
  });
});

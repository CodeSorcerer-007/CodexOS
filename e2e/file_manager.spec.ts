import { test, expect } from './fixtures/tauriMock';

test.describe('Journey 2: File Workspace Browsing', () => {
  // Use mockOptions with vault unlocked and initial path set to 'This PC'
  test.use({
    mockOptions: {
      vaultLocked: false,
      currentPath: null, // Start at This PC
    },
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Navigate to Files module
    const filesNav = page.locator('button[aria-label="Vaults"]');
    await filesNav.click({ force: true });
    // Move mouse away from left sidebar to prevent hover overlay
    await page.mouse.move(600, 300);
    await expect(page.locator('text=Loading Module...')).not.toBeVisible({ timeout: 30000 });
    await expect(page.locator('button:has-text("This PC")').first()).toBeVisible({ timeout: 30000 });
  });

  // ─── TIER 1: Feature Coverage (Primary Happy Paths) ───────────────────────

  test.describe('Tier 1: Feature Coverage', () => {
    test('1.1 displays Devices and drives on initial This PC view', async ({ page }) => {
      await expect(page.locator('text=Devices and drives')).toBeVisible({ timeout: 10000 });
      // Should show drives from mock
      await expect(page.locator('text=Local Disk (C:)').first()).toBeVisible();
    });

    test('1.2 navigates into drive directory when clicking a drive card', async ({ page }) => {
      // Click C: drive
      await page.locator('text=Local Disk (C:)').first().click({ force: true });

      // Should now show C: folder contents
      await expect(page.locator('text=workspace').first()).toBeVisible({ timeout: 10000 });
    });

    test('1.3 renders breadcrumb bar showing navigation hierarchy', async ({ page }) => {
      await page.locator('text=Local Disk (C:)').first().click({ force: true });

      // Breadcrumb should show This PC and C:
      await expect(page.locator('button:has-text("This PC")').first()).toBeVisible();
      await expect(page.locator('header button:has-text("C:")').first()).toBeVisible();
    });

    test('1.4 renders directory file items with filenames in file grid', async ({ page }) => {
      // Navigate to C: -> workspace
      await page.locator('text=Local Disk (C:)').first().click({ force: true });
      await expect(page.locator('text=workspace').first()).toBeVisible();

      // Double click workspace folder
      await page.locator('text=workspace').first().dblclick({ force: true });

      // Verify files in workspace
      await expect(page.locator('text=package.json').first()).toBeVisible({ timeout: 10000 });
      await expect(page.locator('text=README.md').first()).toBeVisible();
    });

    test('1.5 filters file list interactively using the search box', async ({ page }) => {
      // Navigate to C: -> workspace
      await page.locator('text=Local Disk (C:)').first().click({ force: true });
      await page.locator('text=workspace').first().dblclick({ force: true });
      await expect(page.locator('text=package.json').first()).toBeVisible();

      // Type in search box
      const searchInput = page.locator('input[placeholder*="Search"]');
      await searchInput.fill('package');

      // Wait for debounce filter
      await expect(page.locator('text=package.json').first()).toBeVisible();
      await expect(page.locator('text=README.md')).not.toBeVisible();
    });
  });

  // ─── TIER 2: Boundary & Error Handling ────────────────────────────────────

  test.describe('Tier 2: Boundary & Error Handling', () => {
    test('2.1 displays empty match message when search query has no results', async ({ page }) => {
      await page.locator('text=Local Disk (C:)').first().click({ force: true });
      await page.locator('text=workspace').first().dblclick({ force: true });
      await expect(page.locator('text=package.json').first()).toBeVisible();

      const searchInput = page.locator('input[placeholder*="Search"]');
      await searchInput.fill('nonexistent_file_xyz_123');

      await expect(page.locator('text=No files match your search.')).toBeVisible({ timeout: 5000 });
    });

    test('2.2 navigates up one level using the Up navigation button', async ({ page }) => {
      await page.locator('text=Local Disk (C:)').first().click({ force: true });
      await page.locator('text=workspace').first().dblclick({ force: true });
      await expect(page.locator('text=package.json').first()).toBeVisible();

      // Click Up button in header
      const upButton = page.locator('button[title="Up"]');
      await upButton.click({ force: true });

      // Should be back at C: showing workspace folder
      await expect(page.locator('text=workspace').first()).toBeVisible({ timeout: 5000 });
    });

    test('2.3 navigates to ancestor folder by clicking its breadcrumb segment', async ({ page }) => {
      await page.locator('text=Local Disk (C:)').first().click({ force: true });
      await page.locator('text=workspace').first().dblclick({ force: true });
      await expect(page.locator('text=package.json').first()).toBeVisible();

      // Click "This PC" breadcrumb
      await page.locator('header button:has-text("This PC")').click({ force: true });

      // Should be back at This PC
      await expect(page.locator('text=Devices and drives')).toBeVisible({ timeout: 5000 });
    });

    test('2.4 switches view mode from Grid Icons to Details List', async ({ page }) => {
      await page.locator('text=Local Disk (C:)').first().click({ force: true });
      await page.locator('text=workspace').first().dblclick({ force: true });
      await expect(page.locator('text=package.json').first()).toBeVisible();

      // Click Details list button in footer
      const listBtn = page.locator('button[title="Details list"]');
      await listBtn.click({ force: true });

      // Details list header columns should be visible
      await expect(page.locator('text=Name').first()).toBeVisible({ timeout: 5000 });
      await expect(page.locator('text=Type').first()).toBeVisible();
      await expect(page.locator('text=Size').first()).toBeVisible();
    });

    test('2.5 clears search query and restores complete file listing', async ({ page }) => {
      await page.locator('text=Local Disk (C:)').first().click({ force: true });
      await page.locator('text=workspace').first().dblclick({ force: true });
      await expect(page.locator('text=package.json').first()).toBeVisible();

      const searchInput = page.locator('input[placeholder*="Search"]');
      await searchInput.fill('README');
      await expect(page.locator('text=package.json')).not.toBeVisible();

      // Clear search
      await searchInput.fill('');
      // All files restored
      await expect(page.locator('text=package.json').first()).toBeVisible({ timeout: 5000 });
      await expect(page.locator('text=README.md').first()).toBeVisible();
    });
  });

  // ─── TIER 3: Pairwise Combinations ────────────────────────────────────────

  test.describe('Tier 3: Pairwise Combinations', () => {
    test('3.1 pairwise: active search filter persists across Details List view toggle', async ({ page }) => {
      await page.locator('text=Local Disk (C:)').first().click({ force: true });
      await page.locator('text=workspace').first().dblclick({ force: true });
      await expect(page.locator('text=package.json').first()).toBeVisible();

      // Search filter
      const searchInput = page.locator('input[placeholder*="Search"]');
      await searchInput.fill('tsconfig');
      await expect(page.locator('text=tsconfig.json').first()).toBeVisible();
      await expect(page.locator('text=package.json')).not.toBeVisible();

      // Switch to list view
      await page.locator('button:has-text("View")').click({ force: true });
      await page.locator('div:has-text("Details List")').first().click({ force: true });

      // Filtered file should still be displayed
      await expect(page.locator('text=tsconfig.json').first()).toBeVisible();
      await expect(page.locator('text=package.json')).not.toBeVisible();
    });

    test('3.2 pairwise: right click on file triggers contextual action menu', async ({ page }) => {
      await page.locator('text=Local Disk (C:)').first().click({ force: true });
      await page.locator('text=workspace').first().dblclick({ force: true });
      await expect(page.locator('text=README.md').first()).toBeVisible();

      // Right click README.md
      await page.locator('text=README.md').first().click({ button: 'right', force: true });

      // Context menu options should appear
      await expect(page.locator('text=Rename').first()).toBeVisible({ timeout: 5000 });
      await expect(page.locator('text=Delete').first()).toBeVisible();
    });
  });

  // ─── TIER 4: Real-World Application Scenario ──────────────────────────────

  test.describe('Tier 4: Real-World Workflows', () => {
    test('4.1 scenario: Code Exploration & Workspace File Search Lifecycle', async ({ page }) => {
      // Step 1: Browse devices and locate primary system drive
      await expect(page.locator('text=Devices and drives')).toBeVisible();
      await page.locator('text=Local Disk (C:)').first().click({ force: true });

      // Step 2: Open workspace directory
      await expect(page.locator('text=workspace').first()).toBeVisible();
      await page.locator('text=workspace').first().dblclick({ force: true });

      // Step 3: Enter source subdirectory
      await expect(page.locator('text=src').first()).toBeVisible();
      await page.locator('text=src').first().dblclick({ force: true });

      // Step 4: Verify deep source tree files rendered
      await expect(page.locator('text=App.tsx').first()).toBeVisible();
      await expect(page.locator('text=ipc.ts').first()).toBeVisible();

      // Step 5: Filter files by query 'App'
      const searchInput = page.locator('input[placeholder*="Search"]');
      await searchInput.fill('App');
      await expect(page.locator('text=App.tsx').first()).toBeVisible();
      await expect(page.locator('text=ipc.ts')).not.toBeVisible();

      // Step 6: Clear search and use breadcrumb to jump directly back to workspace root
      await searchInput.fill('');
      await page.locator('header button:has-text("workspace")').click({ force: true });
      await expect(page.locator('text=package.json').first()).toBeVisible({ timeout: 5000 });
    });
  });
});

import { test, expect } from './fixtures/tauriMock';

test.describe('Journey 4: Visual Git Change Staging', () => {
  test.use({
    mockOptions: {
      vaultLocked: false,
      currentPath: 'C:/workspace',
    },
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Navigate to Git Client module
    const gitNav = page.locator('button[aria-label="Git Client"]');
    await gitNav.click({ force: true });
    await page.mouse.move(600, 300);
    await expect(page.locator('text=Loading Module...')).not.toBeVisible({ timeout: 40000 });
    await expect(page.locator('h2:has-text("Source Control")')).toBeVisible({ timeout: 15000 });
  });

  // ─── TIER 1: Feature Coverage (Primary Happy Paths) ───────────────────────

  test.describe('Tier 1: Feature Coverage', () => {
    test('1.1 renders Source Control header, branch selector, and commit controls', async ({ page }) => {
      await expect(page.locator('h2:has-text("Source Control")')).toBeVisible();
      // Branch selector dropdown showing current branch
      const branchSelect = page.locator('select');
      await expect(branchSelect).toBeVisible();
      await expect(branchSelect).toHaveValue('main');

      // Commit controls
      await expect(page.locator('textarea[placeholder="Commit message"]')).toBeVisible();
      await expect(page.locator('button:has-text("Commit")')).toBeVisible();
      await expect(page.locator('button:has-text("Push")')).toBeVisible();
    });

    test('1.2 lists unstaged modifications and untracked files in Changes section', async ({ page }) => {
      // Changes section header button
      await expect(page.locator('button:has-text("+ Stage All")')).toBeVisible();
      // Unstaged file
      await expect(page.locator('span:has-text("src/App.tsx")')).toBeVisible();
      // Untracked file
      await expect(page.locator('span:has-text("src/new_feature.ts")')).toBeVisible();
    });

    test('1.3 stages an individual file using the "+" button', async ({ page }) => {
      // Find row for src/App.tsx and click its "+" stage button
      const appRow = page.locator('div:has(> span:has-text("src/App.tsx"))');
      await appRow.locator('button:has-text("+")').click({ force: true });

      // File should now appear under Staged Changes
      await expect(page.locator('text=Staged Changes')).toBeVisible({ timeout: 10000 });
      const stagedRow = page.locator('div:has(> span:has-text("src/App.tsx")).text-green-400');
      await expect(stagedRow).toBeVisible();
    });

    test('1.4 stages all modified and untracked files using "+ Stage All"', async ({ page }) => {
      // Click + Stage All button
      await page.locator('button:has-text("+ Stage All")').click({ force: true });

      // Staged Changes should now contain both files
      await expect(page.locator('text=Staged Changes')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('.text-green-400:has-text("src/App.tsx")')).toBeVisible();
      await expect(page.locator('.text-green-400:has-text("src/new_feature.ts")')).toBeVisible();

      // Changes stage-all button should no longer be displayed
      await expect(page.locator('button:has-text("+ Stage All")')).not.toBeVisible();
    });

    test('1.5 unstages a staged file using the "-" button', async ({ page }) => {
      // Stage src/App.tsx first
      const appRow = page.locator('div:has(> span:has-text("src/App.tsx"))');
      await appRow.locator('button:has-text("+")').click({ force: true });
      await expect(page.locator('text=Staged Changes')).toBeVisible();

      // Click "-" unstage button on staged row
      const stagedRow = page.locator('div:has(> span:has-text("src/App.tsx")).text-green-400');
      await stagedRow.locator('button:has-text("-")').click({ force: true });

      // File returns to unstaged Changes
      await expect(page.locator('.text-orange-400:has-text("src/App.tsx")')).toBeVisible({ timeout: 10000 });
    });
  });

  // ─── TIER 2: Boundary & Error Handling ────────────────────────────────────

  test.describe('Tier 2: Boundary & Error Handling', () => {
    test('2.1 unstages all staged files using "- Unstage All"', async ({ page }) => {
      // Stage all files
      await page.locator('button:has-text("+ Stage All")').click({ force: true });
      await expect(page.locator('text=Staged Changes')).toBeVisible();

      // Click - Unstage All
      await page.locator('button:has-text("- Unstage All")').click({ force: true });

      // Staged Changes header disappears, files return to Changes
      await expect(page.locator('text=Staged Changes')).not.toBeVisible({ timeout: 10000 });
      await expect(page.locator('button:has-text("+ Stage All")')).toBeVisible();
      await expect(page.locator('span:has-text("src/App.tsx")')).toBeVisible();
    });

    test('2.2 disables Commit button when no files are staged', async ({ page }) => {
      // Staged list is empty initially
      await expect(page.locator('text=Staged Changes')).not.toBeVisible();

      // Commit button must be disabled
      const commitBtn = page.locator('button:has-text("Commit")');
      await expect(commitBtn).toBeDisabled();
    });

    test('2.3 enables Commit button when changes are staged', async ({ page }) => {
      // Stage a file
      const appRow = page.locator('div:has(> span:has-text("src/App.tsx"))');
      await appRow.locator('button:has-text("+")').click({ force: true });

      // Commit button should now be enabled
      const commitBtn = page.locator('button:has-text("Commit")');
      await expect(commitBtn).toBeEnabled({ timeout: 10000 });
    });

    test('2.4 switches to Branches tab and displays repository branch list', async ({ page }) => {
      // Click Branches tab
      await page.locator('button:has-text("Branches")').click({ force: true });

      // Verify branches listed in branch cards
      await expect(page.locator('div.font-mono:has-text("main")')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('span:has-text("Current")')).toBeVisible();
      await expect(page.locator('div.font-mono:has-text("feature/e2e-testing")')).toBeVisible();
    });

    test('2.5 displays Git History commit graph when History tab is active', async ({ page }) => {
      // History tab is active by default
      const historyTab = page.locator('button:has-text("History")');
      await expect(historyTab).toBeVisible();

      // React Flow canvas or commit info present
      await expect(page.locator('.react-flow')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('text=feat: add automated e2e testing suite')).toBeVisible();
    });
  });

  // ─── TIER 3: Pairwise Combinations ────────────────────────────────────────

  test.describe('Tier 3: Pairwise Combinations', () => {
    test('3.1 pairwise: stages file and views staged diff in Diff tab', async ({ page }) => {
      // Stage src/App.tsx
      const appRow = page.locator('div:has(> span:has-text("src/App.tsx"))');
      await appRow.locator('button:has-text("+")').click({ force: true });
      await expect(page.locator('text=Staged Changes')).toBeVisible();

      // Click the staged file row to inspect its staged diff
      const stagedRow = page.locator('div:has(> span:has-text("src/App.tsx")).text-green-400');
      await stagedRow.click({ force: true });

      // Diff tab automatically activates and displays staged diff
      await expect(page.locator('button:has-text("Diff (src/App.tsx)")')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('text=+ staged changes for src/App.tsx')).toBeVisible({ timeout: 10000 });
    });

    test('3.2 pairwise: enters custom commit message and commits staged changes', async ({ page }) => {
      // Stage all files
      await page.locator('button:has-text("+ Stage All")').click({ force: true });
      await expect(page.locator('text=Staged Changes')).toBeVisible();

      // Enter commit message
      const msgInput = page.locator('textarea[placeholder="Commit message"]');
      await msgInput.fill('feat(git): automated stage and commit test');

      // Click Commit
      const commitBtn = page.locator('button:has-text("Commit")');
      await expect(commitBtn).toBeEnabled();
      await commitBtn.click({ force: true });

      // Staged list clears, message resets, and commit button disables
      await expect(page.locator('text=Staged Changes')).not.toBeVisible({ timeout: 10000 });
      await expect(msgInput).toHaveValue('');
      await expect(commitBtn).toBeDisabled();
    });
  });

  // ─── TIER 4: Real-World Application Scenario ──────────────────────────────

  test.describe('Tier 4: Real-World Workflows', () => {
    test('4.1 scenario: Developer Git Review, Staging, and Commit Lifecycle', async ({ page }) => {
      // Step 1: Review unstaged changes in repository
      await expect(page.locator('h2:has-text("Source Control")')).toBeVisible();
      await expect(page.locator('button:has-text("+ Stage All")')).toBeVisible();
      await expect(page.locator('span:has-text("src/App.tsx")')).toBeVisible();

      // Step 2: Click unstaged file to inspect its diff
      await page.locator('span:has-text("src/App.tsx")').click({ force: true });
      await expect(page.locator('text=+ new modified line in src/App.tsx')).toBeVisible({ timeout: 10000 });

      // Step 3: Stage all files for commit
      await page.locator('button:has-text("+ Stage All")').click({ force: true });
      await expect(page.locator('text=Staged Changes')).toBeVisible({ timeout: 10000 });

      // Step 4: Write commit message
      const commitInput = page.locator('textarea[placeholder="Commit message"]');
      await commitInput.fill('chore: release v2.2.0 updates');

      // Step 5: Execute commit
      const commitBtn = page.locator('button:has-text("Commit")');
      await commitBtn.click({ force: true });

      // Step 6: Verify clean working directory
      await expect(page.locator('text=Staged Changes')).not.toBeVisible({ timeout: 10000 });
      await expect(commitBtn).toBeDisabled();
    });
  });
});

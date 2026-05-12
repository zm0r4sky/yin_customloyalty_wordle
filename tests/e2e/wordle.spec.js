const { test, expect } = require('@playwright/test');

/**
 * End-To-End (E2E) UI Tests for YIN Wordle PWA
 * Validates fully simulated gamification cycles, keyboard interaction, modals, and offline banners.
 */
test.describe('Wordle PWA E2E Flows', () => {

  test.beforeEach(async ({ page }) => {
    // Navigate to the app (automatically served on port 8080 by Playwright webServer)
    await page.goto('/');
    // Wait for the board to build and the game to initialize (resolves async initGame network delay)
    await page.locator('#tile-0-0').waitFor();
  });

  test('should render game container, stats, and empty board on start', async ({ page }) => {
    // Assert Header and Title
    await expect(page.locator('h1')).toHaveText('WORDLE');
    await expect(page.locator('#streak-display')).toContainText('🔥 0');
    await expect(page.locator('#points-display')).toContainText('💰 0 pkt');

    // Assert Board contains 6 rows, each having 5 tiles
    const rows = page.locator('#board .board-row');
    await expect(rows).toHaveCount(6);

    const firstRowTiles = rows.first().locator('.tile');
    await expect(firstRowTiles).toHaveCount(5);
  });

  test('should handle virtual keyboard clicks and input characters', async ({ page }) => {
    // Click keyboard keys to type "EKRAN"
    await page.locator('button[data-key="E"]').click();
    await page.locator('button[data-key="K"]').click();
    await page.locator('button[data-key="R"]').click();
    await page.locator('button[data-key="A"]').click();
    await page.locator('button[data-key="N"]').click();

    // Verify first row tiles have the letters typed
    for (let c = 0; c < 5; c++) {
      const tile = page.locator(`#tile-0-${c}`);
      await expect(tile).toHaveText(['E', 'K', 'R', 'A', 'N'][c]);
      await expect(tile).toHaveClass(/filled/);
    }

    // Press Backspace
    await page.locator('button[data-key="BACKSPACE"]').click();
    const lastTile = page.locator('#tile-0-4');
    await expect(lastTile).toBeEmpty();
    await expect(lastTile).not.toHaveClass(/filled/);
  });

  test('should handle physical keyboard presses', async ({ page }) => {
    // Type using physical keyboard
    await page.keyboard.type('obraz'); // lowercase gets normalized to uppercase by handlePhysicalKeyboard
    
    for (let c = 0; c < 5; c++) {
      const tile = page.locator(`#tile-0-${c}`);
      await expect(tile).toHaveText(['O', 'B', 'R', 'A', 'Z'][c]);
    }
  });

  test('should show validation toast if the word is too short', async ({ page }) => {
    // Type 4 letters and press ENTER
    await page.keyboard.type('skle');
    await page.keyboard.press('Enter');

    // Toast message "Za krótkie słowo" should be displayed
    const toast = page.locator('#toast-container .toast');
    await expect(toast).toContainText('Za krótkie słowo');
    
    // Check if current row shakes
    const row = page.locator('#row-0');
    await expect(row).toHaveClass(/shake/);
  });

  test('should complete a perfect win game cycle with ad gateway and reward claiming', async ({ page }) => {
    // 1. Enter the daily word "SKLEP"
    await page.keyboard.type('sklep');
    await page.keyboard.press('Enter');

    // 2. Wait for tiles to flip and turn green (correct)
    for (let c = 0; c < 5; c++) {
      const tile = page.locator(`#tile-0-${c}`);
      await expect(tile).toHaveClass(/correct/, { timeout: 3000 });
    }

    // 3. Ad modal should pop up
    const adModal = page.locator('#ad-modal');
    await expect(adModal).toBeVisible({ timeout: 2000 });

    // 4. Verify countdown exists
    const countdown = page.locator('#ad-countdown');
    await expect(countdown).toBeVisible();

    // 5. Wait for countdown to reach 0 and skip button to be active
    const skipBtn = page.locator('#skip-ad-btn');
    await expect(skipBtn).toBeEnabled({ timeout: 6000 });

    // 6. Click to close ad and claim reward
    await skipBtn.click();

    // 7. End modal summary should be displayed with "Wygrałeś!"
    const endModal = page.locator('#end-modal');
    await expect(endModal).toBeVisible();
    await expect(page.locator('#end-title')).toHaveText('Wygrałeś!');
    await expect(page.locator('#end-points')).toHaveText('100');
    await expect(page.locator('#stat-streak')).toHaveText('1');

    // 8. Close end modal and check updated top bar stats
    await page.locator('#close-end-modal').click();
    await expect(endModal).not.toBeVisible();
    await expect(page.locator('#streak-display')).toContainText('🔥 1');
    await expect(page.locator('#points-display')).toContainText('💰 100 pkt');
  });

  test('should toggle offline banner when connection state changes', async ({ page }) => {
    const offlineIndicator = page.locator('#offline-indicator');
    await expect(offlineIndicator).not.toBeVisible();

    // Dispatch offline event in browser
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    await expect(offlineIndicator).toBeVisible();

    // Dispatch online event
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(offlineIndicator).not.toBeVisible();
  });
});

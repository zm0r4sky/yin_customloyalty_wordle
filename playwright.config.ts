import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright Configuration File for YIN Wordle PWA
 * Supports both headless browser-based Unit testing and full E2E flows.
 */
export default defineConfig({
  testDir: './tests/e2e', // We only have E2E tests in Playwright now, Vitest has Unit tests
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: 'http://127.0.0.1:8090', // Using 127.0.0.1 instead of localhost for Windows compatibility
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    }
  ],

  /* Run local dev server before starting the tests */
  webServer: {
    command: 'npm run serve:test',
    url: 'http://127.0.0.1:8090', // Using 127.0.0.1 instead of localhost for Windows compatibility
    reuseExistingServer: !process.env.CI,
    timeout: 15 * 1000,
  },
});

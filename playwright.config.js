const { defineConfig, devices } = require('@playwright/test');

/**
 * Playwright Configuration File for YIN Wordle PWA
 * Supports both headless browser-based Unit testing and full E2E flows.
 */
module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: 'http://localhost:8080',
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
    command: 'npx http-server ./pwa_mvp -p 8080',
    url: 'http://localhost:8080',
    reuseExistingServer: !process.env.CI,
    timeout: 10 * 1000,
  },
});

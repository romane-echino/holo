import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright configuration for Holo editor tests.
 *
 * Tests run against the Vite dev server (port 5173).
 * If the server is already running (local dev), it's reused.
 * In CI, the server is started fresh.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'html',

  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    // Enough time for React renders and Vite HMR
    actionTimeout: 5_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: 'npm run dev:renderer',
    url: 'http://localhost:5173',
    // Reuse running dev server in local dev to avoid restarting
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
})

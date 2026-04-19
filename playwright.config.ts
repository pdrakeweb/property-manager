import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright config for integration tests against the running Vite dev server.
 *
 * Tests run in dev-bypass mode (they set `google_access_token = 'dev_token'`
 * in localStorage before navigating), so no real OAuth flow or Drive calls
 * are needed. Dev bypass redirects Drive traffic through localDriveAdapter
 * (pm_dev_drive_v1 in localStorage).
 */
export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  retries: 0,
  workers: 1,                       // tests mutate shared localStorage — don't parallelize
  reporter: [['list']],

  use: {
    baseURL: 'http://localhost:5174',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],

  webServer: {
    // Run tests against a dedicated port so concurrent dev servers
    // (in sibling worktrees) don't get reused.
    command: 'npm run dev -- --port 5174 --strictPort',
    url: 'http://localhost:5174',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})

import { defineConfig } from '@playwright/test'

// Note: a static server on port 5180 is referenced by some legacy harnesses
// (none of the current Playwright specs use it). If a future test needs one,
// add a second `webServer` entry with `command: 'npx vite preview --port 5180'`
// or similar and a matching `url`.

export default defineConfig({
  testDir: './tests',
  testMatch: /.*\.spec\.ts$/,
  timeout: 30_000,
  globalTimeout: 60_000,
  globalSetup: './tests/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
    navigationTimeout: 30_000,
  },
  webServer: {
    command: 'npm run dev -- --port 5173',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})

import { chromium, FullConfig } from '@playwright/test'

// Warms up Vite so the first real test doesn't pay the cold-compile cost
// (which can blow past the 30s per-test timeout on the first navigation).
export default async function globalSetup(_config: FullConfig) {
  const browser = await chromium.launch()
  const page = await browser.newPage()
  try {
    await page.goto('http://localhost:5173/#/', { timeout: 60_000, waitUntil: 'load' })
  } finally {
    await browser.close()
  }
}

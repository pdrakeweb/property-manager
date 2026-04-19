import { test, expect, type Page } from '@playwright/test'

/**
 * Smoke test — verifies the app boots into dev-bypass mode and the main
 * screens render without runtime errors. Does not exercise Drive or OAuth.
 */

async function openAppInDevMode(page: Page): Promise<void> {
  // Seed dev-bypass auth before the first load so SignInScreen is skipped.
  await page.addInitScript(() => {
    localStorage.setItem('google_access_token',     'dev_token')
    localStorage.setItem('google_token_expires_at', String(Date.now() + 3600_000))
    localStorage.setItem('google_user_email',       'dev@local')
    localStorage.setItem('google_user_name',        'Dev User')
  })
  await page.goto('/')
  // Dashboard header is the first thing rendered post-login.
  await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening), Pete/ })).toBeVisible()
}

test('dashboard loads in dev mode', async ({ page }) => {
  await openAppInDevMode(page)
  await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening), Pete/ })).toBeVisible()
})

test('all core routes render', async ({ page }) => {
  await openAppInDevMode(page)
  for (const path of ['/maintenance', '/budget', '/advisor', '/inventory', '/settings']) {
    await page.goto(`/#${path}`)
    // Each screen has at least one heading — assert no render error
    await expect(page.locator('h1, h2').first()).toBeVisible()
  }
})

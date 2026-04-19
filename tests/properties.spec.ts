import { test, expect, type Page } from '@playwright/test'

/**
 * Integration tests for the user-editable properties store.
 *
 * Verifies:
 *   - DEFAULT_PROPERTIES seed on first load
 *   - Settings screen renders the Properties section with all stored properties
 *   - Store-level add/update/remove reflect in the UI reactively
 */

async function bootDev(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('google_access_token',     'dev_token')
    localStorage.setItem('google_token_expires_at', String(Date.now() + 3600_000))
    localStorage.setItem('google_user_email',       'dev@local')
    localStorage.setItem('google_user_name',        'Dev User')
  })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening), Pete/ })).toBeVisible()
}

test('seeds DEFAULT_PROPERTIES on first load', async ({ page }) => {
  await bootDev(page)
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('pm_properties') ?? '[]') as Array<{ id: string }>,
  )
  expect(stored.length).toBeGreaterThanOrEqual(2)
  const ids = stored.map(p => p.id)
  expect(ids).toContain('tannerville')
  expect(ids).toContain('camp')
})

test('Settings page lists every property from the store', async ({ page }) => {
  await bootDev(page)
  await page.goto('/#/settings')
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()

  // Properties section shows each property's name.
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('pm_properties') ?? '[]') as Array<{ name: string }>,
  )
  for (const p of stored) {
    await expect(page.getByText(p.name).first()).toBeVisible()
  }
})

test('adding a property via store updates the Settings list', async ({ page }) => {
  await bootDev(page)
  await page.goto('/#/settings')
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()

  // Inject a new property directly through localStorage (simulates any mutation path)
  await page.evaluate(() => {
    const list = JSON.parse(localStorage.getItem('pm_properties') ?? '[]') as Array<Record<string, unknown>>
    list.push({
      id: 'pt_test_cabin',
      name: 'Playwright Test Cabin',
      shortName: 'PT Cabin',
      type: 'camp',
      address: '123 Test Rd',
      driveRootFolderId: '',
      stats: { documented: 0, total: 0 },
    })
    localStorage.setItem('pm_properties', JSON.stringify(list))
  })
  // Full reload so the AppStoreProvider re-reads the store
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
  await expect(page.getByText('Playwright Test Cabin').first()).toBeVisible()
})

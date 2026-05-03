import { test, expect, type Page } from '@playwright/test'

const PROPERTY_ID = 'tannerville'

/**
 * Bootstrap localStorage so the app loads in dev-token mode (the
 * `localDriveAdapter` short-circuit) and treats Tannerville as the
 * active property. Run before every spec so each test starts from a
 * clean, deterministic state.
 */
async function seed(page: Page): Promise<void> {
  await page.goto('/')
  await page.evaluate(([propertyId]) => {
    localStorage.clear()
    // `isAuthenticated()` keys on `google_access_token`; `dev_token`
    // routes Drive calls to the local in-memory adapter.
    localStorage.setItem('google_access_token', 'dev_token')
    localStorage.setItem('google_user_email', 'dev@local')
    localStorage.setItem('active_property_id', propertyId)
  }, [PROPERTY_ID])
  await page.reload()
  // Wait for the AppShell to mount — the sidebar is the lg-breakpoint
  // sidebar; `first()` is ours regardless of viewport size.
  await expect(page.locator('aside').first()).toBeVisible({ timeout: 15_000 })
}

/**
 * Read the stored per-property module map. Used to verify that toggle
 * actions persist to localStorage.
 */
async function readModuleMap(page: Page): Promise<Record<string, boolean>> {
  return page.evaluate((propertyId) => {
    const raw = localStorage.getItem(`pm_property_modules_${propertyId}`)
    if (!raw) return {}
    try {
      const parsed = JSON.parse(raw) as { enabled?: Record<string, boolean> }
      return parsed.enabled ?? {}
    } catch {
      return {}
    }
  }, PROPERTY_ID)
}

/**
 * Sidebar nav links keyed by their hash href. Returns the set of
 * `#/...` paths currently rendered in the desktop aside, which lets
 * tests assert nav appearance/disappearance without DOM-shape coupling.
 */
async function visibleNavPaths(page: Page): Promise<string[]> {
  return page.locator('aside a[href^="#/"]').evaluateAll(els =>
    els.map(a => (a as HTMLAnchorElement).getAttribute('href')!).filter(Boolean),
  )
}

/**
 * Open the module-settings screen and wait for the card grid.
 */
async function openModuleSettings(page: Page): Promise<void> {
  await page.evaluate(() => { window.location.hash = '#/settings/modules' })
  await expect(page.getByRole('heading', { name: /^Modules$/ })).toBeVisible()
}

test.describe('Module system — integration', () => {
  test.beforeEach(async ({ page }) => {
    await seed(page)
  })

  // 1 — Disabling AI cascades off contents (and import + risk), routes
  // for the cascaded modules become unreachable. Re-enabling AI brings
  // the cascade back when the dependents were already on.
  test('toggle + dep cascade — AI off hides contents nav, AI on restores it', async ({ page }) => {
    await openModuleSettings(page)

    // Pre-condition: every module enabled (defaults policy).
    {
      const enabled = await readModuleMap(page)
      expect(enabled.ai).toBeTruthy()
      expect(enabled.contents).toBeTruthy()
    }

    // Disable AI — its dependents (contents, import, risk) cascade off.
    await page.getByRole('button', { name: /^Disable AI Advisor$/i }).first().click()
    await expect.poll(async () => (await readModuleMap(page)).ai).toBe(false)
    await expect.poll(async () => (await readModuleMap(page)).contents).toBe(false)

    // Sidebar reflects the change — `/contents` and `/advisor` (AI's
    // primary nav) are gone.
    const navAfterOff = await visibleNavPaths(page)
    expect(navAfterOff).not.toContain('#/contents')
    expect(navAfterOff).not.toContain('#/advisor')
    expect(navAfterOff).toContain('#/')           // dashboard still there
    expect(navAfterOff).toContain('#/settings')   // settings always reachable

    // /contents now falls through the static catch-all → dashboard.
    await page.evaluate(() => { window.location.hash = '#/contents' })
    await expect.poll(async () => page.evaluate(() => window.location.hash))
      .toBe('#/')

    // Re-enable AI — contents flag stays off (cascade-off doesn't auto-
    // re-enable on cascade-on), but AI's own routes come back. AI's
    // nav lives in the collapsed "Tools" section, so we don't check
    // sidebar visibility here — the durable signal is the persisted
    // flag plus the route resolving instead of redirecting.
    await openModuleSettings(page)
    await page.getByRole('button', { name: /^Enable AI Advisor$/i }).first().click()
    await expect.poll(async () => (await readModuleMap(page)).ai).toBe(true)

    await page.evaluate(() => { window.location.hash = '#/advisor' })
    await page.waitForTimeout(200)
    await expect.poll(async () => page.evaluate(() => window.location.hash))
      .toBe('#/advisor')
  })

  // 2 — All 26 module cards render. Toggling a non-required module
  // off-then-on flips the localStorage flag both ways.
  test('module settings screen — every module renders, non-required toggles persist', async ({ page }) => {
    await openModuleSettings(page)

    // Card count: at minimum the 26 modules merged into master. The
    // module-settings page renders one toggle button per card with an
    // aria-label of "Disable <name>" or "Enable <name>"; counting them
    // is structurally insulated from CSS layout changes.
    const toggleCount = await page.locator('button[aria-label^="Disable "], button[aria-label^="Enable "]').count()
    expect(toggleCount).toBeGreaterThanOrEqual(26)

    // Toggle Maintenance off-and-on. Verify both transitions land in
    // localStorage. Maintenance is a safe target — non-required and
    // depended on by nobody at the time of writing, so cascading
    // doesn't pollute the test.
    await page.getByRole('button', { name: /^Disable Maintenance$/i }).first().click()
    await expect.poll(async () => (await readModuleMap(page)).maintenance).toBe(false)

    await page.getByRole('button', { name: /^Enable Maintenance$/i }).first().click()
    await expect.poll(async () => (await readModuleMap(page)).maintenance).toBe(true)
  })

  // 3 — Each module that declares a `routes[].path` resolves without
  // an error boundary trip. We sample a dozen primary paths rather
  // than walking all routes — module routes that 404 silently are
  // already caught by the per-module unit tests; this is the smoke
  // check that the app shell + lazy loader cooperate.
  test('route availability — primary module paths render without crashes', async ({ page }) => {
    const PRIMARY_PATHS = [
      '/',
      '/maintenance',
      '/calendar',
      '/budget',
      '/insurance',
      '/permits',
      '/inventory',
      '/contents',
      '/home-book',
      '/advisor',
      '/risk-brief',
      '/import',
      '/map',
      '/vendors',
      '/sync',
      '/search',
      '/settings',
    ]

    for (const path of PRIMARY_PATHS) {
      await page.evaluate((p) => { window.location.hash = `#${p}` }, path)
      // The error boundary renders "Something went wrong" — its absence
      // is the success signal. We give the lazy chunk a beat to mount.
      await page.waitForTimeout(150)
      const errorBoundaryHit = await page.locator('text=/Something went wrong/i').isVisible().catch(() => false)
      expect(errorBoundaryHit, `${path} hit error boundary`).toBe(false)
    }
  })

  // 4 — Core's toggle button is rendered as `disabled` and clicking
  // it is a no-op (the module-toggle UI uses native `disabled`, so
  // browsers swallow the click event entirely).
  test('core module is required — toggle is locked', async ({ page }) => {
    await openModuleSettings(page)

    const before = (await readModuleMap(page)).core
    // The Core card's toggle is rendered with aria-label "Disable Core"
    // (since Core is enabled by default) and the native `disabled`
    // attribute.
    const coreToggle = page.getByRole('button', { name: /^Disable Core$/i }).first()
    await expect(coreToggle).toBeDisabled()

    // Force-clicking a disabled button is a no-op — we attempt it and
    // confirm the stored flag didn't budge.
    await coreToggle.click({ force: true }).catch(() => undefined)
    const after = (await readModuleMap(page)).core
    expect(after).toBe(before)
  })

  // 5 — "Enable all" turns every module on; "Reset to defaults"
  // returns to the default-everything-on state. Both buttons should
  // produce the same result given the defaults policy = enable all.
  test('enable-all and reset-to-defaults converge to all-enabled', async ({ page }) => {
    await openModuleSettings(page)

    // Disable a couple of optional modules to set up a non-default
    // baseline.
    await page.getByRole('button', { name: /^Disable Mortgage$/i }).first().click()
    await expect.poll(async () => (await readModuleMap(page)).mortgage).toBe(false)

    // Enable all.
    await page.getByRole('button', { name: /^Enable all$/i }).click()
    {
      const map = await readModuleMap(page)
      // Every registered id should be true.
      const allOn = Object.values(map).every(v => v === true)
      expect(allOn).toBe(true)
      expect(map.mortgage).toBe(true)
    }

    // Disable again, then Reset to defaults.
    await page.getByRole('button', { name: /^Disable Mortgage$/i }).first().click()
    await expect.poll(async () => (await readModuleMap(page)).mortgage).toBe(false)

    await page.getByRole('button', { name: /^Reset to defaults$/i }).click()
    {
      const map = await readModuleMap(page)
      const allOn = Object.values(map).every(v => v === true)
      expect(allOn).toBe(true)
    }
  })
})

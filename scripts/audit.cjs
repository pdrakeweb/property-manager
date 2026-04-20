// Playwright functional audit — visits every route, captures JS errors + console
const { chromium } = require('playwright')

const BASE = 'http://localhost:5176'
const ROUTES = [
  '#/',
  '#/maintenance',
  '#/budget',
  '#/inventory',
  '#/property-tax',
  '#/mortgage',
  '#/utilities',
  '#/fuel',
  '#/vendors',
  '#/capture',
  '#/settings',
  '#/conflicts',
  '#/calendar',
  '#/checklists',
  '#/insurance',
]

async function run() {
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({
    permissions: ['camera', 'microphone'],
    viewport: { width: 1280, height: 800 },
  })

  // Inject onerror before navigation
  await ctx.addInitScript(() => {
    window.__jsErrors = []
    window.onerror = (msg, src, line, col, err) => {
      window.__jsErrors.push({ msg: String(msg), src, line, col })
    }
    window.addEventListener('unhandledrejection', e => {
      window.__jsErrors.push({ msg: String(e.reason), src: 'unhandledrejection' })
    })
  })

  const results = []

  for (const route of ROUTES) {
    const page = await ctx.newPage()
    const consoleMessages = []
    const pageErrors = []

    page.on('console', m => {
      if (m.type() === 'error') consoleMessages.push(m.text())
    })
    page.on('pageerror', e => pageErrors.push(e.message))

    try {
      await page.goto(`${BASE}/${route}`, { waitUntil: 'networkidle', timeout: 10000 })
      await page.waitForTimeout(800)

      // Inject CSS to disable animations for screenshot stability
      await page.addStyleTag({ content: '*, *::before, *::after { animation-duration: 0s !important; transition-duration: 0s !important; }' })

      const title = await page.title()
      const bodyText = await page.locator('body').innerText().catch(() => '')
      const hasContent = bodyText.trim().length > 20
      const jsErrors = await page.evaluate(() => window.__jsErrors || [])

      // Check for blank/error screens
      const hasErrorBoundary = bodyText.includes('Something went wrong') || bodyText.includes('Error:')
      const hasNav = await page.locator('nav, aside').count()

      results.push({
        route,
        title,
        hasContent,
        hasNav: hasNav > 0,
        hasErrorBoundary,
        consoleErrors: consoleMessages.slice(0, 3),
        pageErrors: pageErrors.slice(0, 3),
        jsErrors: jsErrors.slice(0, 3),
        status: (!hasErrorBoundary && hasContent) ? 'OK' : 'FAIL',
      })
    } catch (err) {
      results.push({ route, status: 'ERROR', error: err.message })
    } finally {
      await page.close()
    }
  }

  // Dark mode smoke test
  const dmPage = await ctx.newPage()
  await dmPage.goto(`${BASE}/#/`, { waitUntil: 'networkidle', timeout: 10000 })
  await dmPage.evaluate(() => localStorage.setItem('pm-theme', 'dark'))
  await dmPage.reload({ waitUntil: 'networkidle' })
  await dmPage.waitForTimeout(500)
  const hasDarkClass = await dmPage.evaluate(() => document.documentElement.classList.contains('dark'))
  const bgColor = await dmPage.evaluate(() => getComputedStyle(document.body).backgroundColor)
  await dmPage.close()

  await browser.close()

  // Print report
  console.log('\n=== FUNCTIONAL AUDIT ===\n')
  let allOk = true
  for (const r of results) {
    const icon = r.status === 'OK' ? '✓' : '✗'
    const errors = [...(r.consoleErrors || []), ...(r.pageErrors || []), ...(r.jsErrors?.map(e => e.msg) || [])]
    const errStr = errors.length ? `\n    ERRORS: ${errors.join(' | ')}` : ''
    const boundaryStr = r.hasErrorBoundary ? '\n    ERROR BOUNDARY triggered' : ''
    console.log(`  ${icon} ${r.route.padEnd(22)} ${r.status}${errStr}${boundaryStr}`)
    if (r.status !== 'OK') allOk = false
  }

  console.log('\n=== DARK MODE SMOKE TEST ===')
  console.log(`  html.dark class present: ${hasDarkClass ? '✓' : '✗'}`)
  console.log(`  body background color:   ${bgColor}`)
  console.log(`  Dark mode working:       ${hasDarkClass ? '✓ YES' : '✗ NO'}`)

  console.log(`\n=== SUMMARY ===`)
  const okCount = results.filter(r => r.status === 'OK').length
  console.log(`  Routes passed: ${okCount}/${results.length}`)
  console.log(`  Dark mode:     ${hasDarkClass ? 'working' : 'NOT working'}`)
  console.log(`  Overall:       ${allOk && hasDarkClass ? 'PASS' : 'ISSUES FOUND'}`)

  process.exit(allOk && hasDarkClass ? 0 : 1)
}

run().catch(e => { console.error(e); process.exit(1) })

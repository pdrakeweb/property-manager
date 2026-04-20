/**
 * Step 1 — Full persistence round-trip test
 *
 * Covers every syncable record type:
 *   equipment, task, insurance (policy), permit, generator_log, road, completed_event
 *
 * Flow per type:
 *  1. Inject record into pm_index_v1 as pending_upload
 *  2. Reload → useStartupSync pushes to pm_dev_drive_v1 as JSON
 *  3. Verify file exists in dev Drive with correct JSON content
 *  4. Wipe pm_index_v1
 *  5. Reload → useStartupSync seeds tasks + pulls all .json files from Drive
 *  6. Verify each record restored: correct type, syncState='synced', all fields intact
 *
 * Run: node scripts/persist-test.cjs  (dev server must be running on :5173)
 */

const { chromium } = require('playwright')

const BASE        = 'http://localhost:5173'
const PROP_ID     = 'tannerville'
const ROOT_FOLDER = '14CifGAre0egOHO0qVdrVBXCQY0WXk6Wt'

const PASS = '\x1b[32m✓\x1b[0m'
const FAIL = '\x1b[31m✗\x1b[0m'
const INFO = '\x1b[36m·\x1b[0m'

let passed = 0
let failed = 0

function assert(condition, label) {
  if (condition) { console.log(`  ${PASS} ${label}`); passed++ }
  else           { console.log(`  ${FAIL} ${label}`); failed++ }
  return !!condition
}

async function waitFor(page, fn, timeout = 8000, interval = 200) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const result = await page.evaluate(fn)
    if (result) return result
    await page.waitForTimeout(interval)
  }
  return null
}

// ── Test records (one per syncable type) ──────────────────────────────────────

const NOW = new Date().toISOString()

const TEST_RECORDS = [
  {
    label: 'equipment',
    record: {
      id: 'pt_equip_001',
      type: 'equipment',
      categoryId: 'hvac',
      propertyId: PROP_ID,
      title: 'PT Carrier Furnace 96',
      data: {
        id: 'pt_equip_001',
        propertyId: PROP_ID,
        label: 'PT Carrier Furnace 96',
        categoryId: 'hvac',
        brand: 'Carrier',
        model: '96% AFUE Gas Furnace',
        serialNumber: 'SN-PERSIST-001',
        installYear: 2019,
        location: 'Basement utility room',
        filename: 'equipment_pt_equip_001.json',
        rootFolderId: ROOT_FOLDER,
        categoryId2: 'hvac',
      },
      syncState: 'pending_upload',
      localUpdatedAt: NOW,
    },
    verify: (r) => r.type === 'equipment' && r.data?.brand === 'Carrier' && r.data?.serialNumber === 'SN-PERSIST-001',
  },
  {
    label: 'task',
    record: {
      id: 'pt_task_001',
      type: 'task',
      categoryId: 'hvac',
      propertyId: PROP_ID,
      title: 'PT HVAC Filter Replacement',
      data: {
        id: 'pt_task_001',
        propertyId: PROP_ID,
        title: 'PT HVAC Filter Replacement',
        systemLabel: 'HVAC',
        categoryId: 'hvac',
        dueDate: '2026-08-01',
        priority: 'medium',
        status: 'upcoming',
        recurrence: 'Quarterly',
        source: 'manual',
        estimatedCost: 45,
        filename: 'task_pt_task_001.json',
        rootFolderId: ROOT_FOLDER,
      },
      syncState: 'pending_upload',
      localUpdatedAt: NOW,
    },
    verify: (r) => r.type === 'task' && r.data?.dueDate === '2026-08-01' && r.data?.recurrence === 'Quarterly' && r.data?.estimatedCost === 45,
  },
  {
    label: 'insurance (policy)',
    record: {
      id: 'pt_insure_001',
      type: 'insurance',
      categoryId: 'insurance',
      propertyId: PROP_ID,
      title: 'PT State Farm Homeowners',
      data: {
        id: 'pt_insure_001',
        propertyId: PROP_ID,
        type: 'homeowners',
        insurer: 'State Farm',
        policyNumber: 'SF-PERSIST-2026',
        status: 'active',
        effectiveDate: '2026-01-01',
        renewalDate: '2027-01-01',
        annualPremium: 1850,
        coverageAmounts: { dwelling: 400000, personalProperty: 150000, liability: 300000 },
        filename: 'insurance_pt_insure_001.json',
        rootFolderId: ROOT_FOLDER,
        categoryId: 'insurance',
      },
      syncState: 'pending_upload',
      localUpdatedAt: NOW,
    },
    verify: (r) => r.type === 'insurance' && r.data?.policyNumber === 'SF-PERSIST-2026' && r.data?.annualPremium === 1850,
  },
  {
    label: 'permit',
    record: {
      id: 'pt_permit_001',
      type: 'permit',
      categoryId: 'permit',
      propertyId: PROP_ID,
      title: 'PT Electrical Panel Upgrade',
      data: {
        id: 'pt_permit_001',
        propertyId: PROP_ID,
        type: 'electrical',
        status: 'issued',
        permitNumber: 'ELEC-2026-PERSIST',
        description: '200A panel upgrade and service entrance replacement',
        issuedDate: '2026-03-15',
        issuer: 'Wayne County Building Dept',
        contractor: 'Drake Electric LLC',
        cost: 3200,
        filename: 'permit_pt_permit_001.json',
        rootFolderId: ROOT_FOLDER,
        categoryId: 'permit',
      },
      syncState: 'pending_upload',
      localUpdatedAt: NOW,
    },
    verify: (r) => r.type === 'permit' && r.data?.permitNumber === 'ELEC-2026-PERSIST' && r.data?.cost === 3200,
  },
  {
    label: 'generator_log (with runtime entry)',
    record: {
      id: 'pt_gen_001',
      type: 'generator_log',
      categoryId: 'generator_log',
      propertyId: PROP_ID,
      title: 'PT Generac 22kW',
      data: {
        id: 'pt_gen_001',
        propertyId: PROP_ID,
        name: 'PT Generac 22kW',
        model: 'Generac Guardian 22kW',
        installedYear: 2021,
        lastServiceHours: 100,
        cumulativeHours: 147,
        notes: 'Propane-fueled standby generator',
        entries: [
          { id: 'entry_001', date: '2026-04-01', hours: 12, reason: 'Power outage', source: 'manual' },
          { id: 'entry_002', date: '2026-04-10', hours: 35, reason: 'Weekly test run', source: 'manual' },
        ],
        filename: 'generator_log_pt_gen_001.json',
        rootFolderId: ROOT_FOLDER,
        categoryId: 'generator_log',
      },
      syncState: 'pending_upload',
      localUpdatedAt: NOW,
    },
    verify: (r) => r.type === 'generator_log' && r.data?.cumulativeHours === 147 && Array.isArray(r.data?.entries) && r.data?.entries.length === 2,
  },
  {
    label: 'road (road_event)',
    record: {
      id: 'pt_road_001',
      type: 'road',
      categoryId: 'road',
      propertyId: PROP_ID,
      title: 'PT Gravel delivery – lower lane',
      data: {
        id: 'pt_road_001',
        propertyId: PROP_ID,
        maintenanceTypeId: 'gravel',
        date: '2026-04-05',
        vendor: 'Dalton Aggregate',
        quantity: 10,
        unit: 'tons',
        areaDescription: 'Lower driveway lane, first 400 ft',
        cost: 480,
        notes: '3/4 inch crushed limestone',
        filename: 'road_pt_road_001.json',
        rootFolderId: ROOT_FOLDER,
        categoryId: 'road',
      },
      syncState: 'pending_upload',
      localUpdatedAt: NOW,
    },
    verify: (r) => r.type === 'road' && r.data?.maintenanceTypeId === 'gravel' && r.data?.quantity === 10 && r.data?.cost === 480,
  },
  {
    label: 'completed_event (service history)',
    record: {
      id: 'pt_svc_001',
      type: 'completed_event',
      categoryId: 'completed_event',
      propertyId: PROP_ID,
      title: 'PT HVAC tune-up 2026',
      data: {
        id: 'pt_svc_001',
        propertyId: PROP_ID,
        taskTitle: 'PT HVAC tune-up 2026',
        categoryId: 'hvac',
        completionDate: '2026-04-12',
        contractor: 'Comfort Systems Inc',
        cost: 185,
        paymentMethod: 'check',
        notes: 'Annual spring tune-up; replaced filter and checked refrigerant',
        filename: 'completed_event_pt_svc_001.json',
        rootFolderId: ROOT_FOLDER,
        categoryId2: 'completed_event',
      },
      syncState: 'pending_upload',
      localUpdatedAt: NOW,
    },
    verify: (r) => r.type === 'completed_event' && r.data?.completionDate === '2026-04-12' && r.data?.cost === 185,
  },
]

async function run() {
  const browser = await chromium.launch({ headless: true })
  const page    = await browser.newPage()
  page.setDefaultTimeout(15000)

  try {
    // ── Setup: clean state ─────────────────────────────────────────────────
    console.log('\n── Setup: clean state ────────────────────────────────────────')
    await page.goto(BASE + '/#/')
    await page.waitForTimeout(500)

    await page.evaluate(() => {
      localStorage.setItem('google_access_token', 'dev_token')
      localStorage.setItem('google_user_email', 'dev@local')
      localStorage.removeItem('pm_index_v1')
      localStorage.removeItem('pm_dev_drive_v1')
    })
    console.log(`  ${INFO} Dev token set, index and Drive wiped`)

    // ── Phase 1: Inject all test records ───────────────────────────────────
    console.log('\n── Phase 1: Inject test records ──────────────────────────────')
    await page.evaluate((records) => {
      const idx = {}
      for (const r of records) idx[r.id] = r
      localStorage.setItem('pm_index_v1', JSON.stringify(idx))
    }, TEST_RECORDS.map(t => t.record))

    const injected = await page.evaluate(() => {
      const idx = JSON.parse(localStorage.getItem('pm_index_v1') ?? '{}')
      return Object.values(idx).filter(r => r.syncState === 'pending_upload').length
    })
    assert(injected === TEST_RECORDS.length, `All ${TEST_RECORDS.length} test records injected as pending_upload`)

    // ── Phase 2: Reload → startup sync pushes all to dev Drive ────────────
    console.log('\n── Phase 2: Push to dev Drive ────────────────────────────────')
    await page.reload()

    await waitFor(page, () => {
      const idx = JSON.parse(localStorage.getItem('pm_index_v1') ?? '{}')
      const pending = Object.values(idx).filter(r => r.syncState === 'pending_upload')
      return pending.length === 0 ? true : null
    }, 10000)

    const postPush = await page.evaluate(() => {
      const idx = JSON.parse(localStorage.getItem('pm_index_v1') ?? '{}')
      return Object.values(idx).filter(r => r.syncState === 'pending_upload').length
    })
    assert(postPush === 0, `All records pushed (0 pending after sync)`)

    // ── Phase 3: Verify Drive has .json files with correct content ─────────
    console.log('\n── Phase 3: Verify dev Drive file content ────────────────────')
    for (const { label, record } of TEST_RECORDS) {
      const result = await page.evaluate(({ recId, recType, recTitle }) => {
        const devDrive = JSON.parse(localStorage.getItem('pm_dev_drive_v1') ?? '{}')
        const files = Object.values(devDrive).filter(e => !e.isFolder)
        // Find the file for this record — content contains the full IndexRecord JSON
        const file = files.find(f => {
          if (!f.content) return false
          try {
            const parsed = JSON.parse(f.content)
            return parsed.id === recId
          } catch { return false }
        })
        if (!file) return { found: false }
        try {
          const parsed = JSON.parse(file.content)
          return {
            found:      true,
            isJson:     file.name.endsWith('.json'),
            typeMatch:  parsed.type === recType,
            titleMatch: parsed.title === recTitle,
            hasData:    typeof parsed.data === 'object',
          }
        } catch {
          return { found: true, isJson: file.name.endsWith('.json'), parseError: true }
        }
      }, { recId: record.id, recType: record.type, recTitle: record.title })

      assert(result.found,      `[${label}] file present in dev Drive`)
      assert(result.isJson,     `[${label}] filename has .json extension`)
      assert(result.typeMatch,  `[${label}] Drive content has correct type='${record.type}'`)
      assert(result.titleMatch, `[${label}] Drive content has correct title`)
      assert(result.hasData,    `[${label}] Drive content has data object`)
    }

    // ── Phase 4: Wipe localIndex ────────────────────────────────────────────
    console.log('\n── Phase 4: Wipe localIndex ──────────────────────────────────')
    await page.evaluate(() => localStorage.removeItem('pm_index_v1'))
    assert(await page.evaluate(() => !localStorage.getItem('pm_index_v1')), 'pm_index_v1 wiped')

    // ── Phase 5: Reload → pull from Drive ──────────────────────────────────
    console.log('\n── Phase 5: Pull from Drive (reload) ─────────────────────────')
    await page.reload()

    // Wait for index to populate (seed + pull)
    await waitFor(page, () => {
      const idx = JSON.parse(localStorage.getItem('pm_index_v1') ?? '{}')
      return Object.keys(idx).length > 0 ? true : null
    }, 8000)
    await page.waitForTimeout(2000)  // let async pull complete

    // ── Phase 6: Verify all records restored ───────────────────────────────
    console.log('\n── Phase 6: Verify records restored ─────────────────────────')
    const indexSnapshot = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('pm_index_v1') ?? '{}')
    )

    const allRecords = Object.values(indexSnapshot)
    console.log(`  ${INFO} Total records in index: ${allRecords.length}`)

    let allRoundTripPassed = true
    for (const { label, record, verify } of TEST_RECORDS) {
      const restored = indexSnapshot[record.id]

      const found     = !!restored
      const typeOk    = found && restored.type === record.type
      const synced    = found && restored.syncState === 'synced'
      const verifyOk  = found && verify(restored)

      assert(found,    `[${label}] id='${record.id}' restored in localIndex`)
      assert(typeOk,   `[${label}] type='${record.type}' preserved`)
      assert(synced,   `[${label}] syncState='synced'`)
      assert(verifyOk, `[${label}] all key fields intact`)

      if (!found || !typeOk || !synced || !verifyOk) allRoundTripPassed = false
    }

    if (allRoundTripPassed) {
      console.log(`\n  ${PASS} All ${TEST_RECORDS.length} record types round-tripped cleanly`)
    }

  } catch (err) {
    console.error(`\n  FATAL: ${err.message}\n${err.stack}`)
    failed++
  } finally {
    await browser.close()
  }

  // ── Results ────────────────────────────────────────────────────────────────
  const total = passed + failed
  console.log('\n══════════════════════════════════════════════════════════════')
  if (failed === 0) {
    console.log(`\x1b[32m  All ${total} assertions passed\x1b[0m`)
  } else {
    console.log(`\x1b[33m  ${passed}/${total} passed, \x1b[31m${failed} failed\x1b[0m`)
  }
  console.log('══════════════════════════════════════════════════════════════\n')
  process.exit(failed > 0 ? 1 : 0)
}

run().catch(err => { console.error(err); process.exit(1) })

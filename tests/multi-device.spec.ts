/**
 * Multi-device CRDT integration tests.
 *
 * Each scenario simulates two browsers (Device A + Device B) operating
 * concurrently against the same logical Drive. The dev memory adapter
 * stores its files in `localStorage.pm_dev_drive_v1`, so each Playwright
 * BrowserContext has its OWN copy of the "Drive" — we reconcile them in
 * test scope via the `DriveBus` helper, which copies the shared canonical
 * state in/out of each device's localStorage around every sync op.
 *
 * The bus models the real-world contract precisely:
 *  - before a device pulls or pushes, its localStorage Drive is overwritten
 *    with the latest shared canonical content;
 *  - after the op, the device's Drive content is harvested back as the new
 *    canonical state.
 * That makes test ordering — "A pushes, THEN B pulls" — semantically
 * equivalent to the real Drive's serialised view of writes.
 */

import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test'

const PROP_ID    = 'tannerville'
const ROOT_FOLDER = '14CifGAre0egOHO0qVdrVBXCQY0WXk6Wt'

// ───────────────────────────────────────────────────────────────────────────
// Device fixture
// ───────────────────────────────────────────────────────────────────────────

interface Device {
  page:    Page
  context: BrowserContext
  id:      string   // pm_device_id — deterministic per device for stable vclock assertions
  name:    string
}

/**
 * Spin up an isolated browser context, set deterministic device id + dev
 * auth, navigate to the app, wait for the initial startup sync to settle.
 */
async function makeDevice(browser: Browser, name: string, deviceId: string): Promise<Device> {
  const context = await browser.newContext()
  const page    = await context.newPage()

  // Visit once to seat the origin so localStorage writes stick.
  await page.goto('/#/')
  await page.evaluate(({ deviceId }) => {
    // Wipe any prior state — each scenario runs from a clean slate.
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith('pm_') || k === 'active_property_id' || k.startsWith('google_')) {
        localStorage.removeItem(k)
      }
    }
    // Dev-bypass auth.
    localStorage.setItem('google_access_token',     'dev_token')
    localStorage.setItem('google_token_expires_at', String(Date.now() + 3600_000))
    localStorage.setItem('google_user_email',       `${deviceId}@local`)
    localStorage.setItem('google_user_name',        deviceId)
    // Pin the device id BEFORE the vault first builds — getDeviceId() will
    // pick this up and the vault will use it as the vclock actor.
    localStorage.setItem('pm_device_id', deviceId)
  }, { deviceId })

  // Reload so the vault singleton boots with the pinned device id.
  await page.reload()
  // Let useStartupSync's first run finish (no records yet → fast).
  await page.waitForTimeout(1500)

  return { page, context, id: deviceId, name }
}

// ───────────────────────────────────────────────────────────────────────────
// Shared "canonical Drive" bus
// ───────────────────────────────────────────────────────────────────────────

class DriveBus {
  private state = ''

  /** Push the canonical drive INTO this device's localStorage so the next
   *  push/pull sees it. Call before every sync op. */
  async installInto(device: Device): Promise<void> {
    await device.page.evaluate(d => {
      if (d) localStorage.setItem('pm_dev_drive_v1', d)
      else   localStorage.removeItem('pm_dev_drive_v1')
    }, this.state)
  }

  /** Harvest the device's localStorage drive back into the canonical state.
   *  Call after every sync op. */
  async harvestFrom(device: Device): Promise<void> {
    this.state = await device.page.evaluate(() => localStorage.getItem('pm_dev_drive_v1') || '')
  }

  parsedFiles(): Array<{ id: string; name: string; etag?: string; content?: string }> {
    if (!this.state) return []
    try {
      const drive = JSON.parse(this.state) as Record<string, { id: string; name: string; isFolder: boolean; etag?: string; content?: string }>
      return Object.values(drive)
        .filter(e => !e.isFolder)
        .map(e => ({ id: e.id, name: e.name, etag: e.etag, content: e.content }))
    } catch { return [] }
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Sync ops — dynamic-import the host syncEngine inside the page so we hit
// the same vault singleton the running app is already using.
// ───────────────────────────────────────────────────────────────────────────

async function pushOnly(bus: DriveBus, device: Device): Promise<{ uploaded: number; failed: number; errors: string[] }> {
  await bus.installInto(device)
  const result = await device.page.evaluate(async () => {
    const m = await import('/src/lib/syncEngine.ts')
    return m.pushPending('dev_token')
  })
  await bus.harvestFrom(device)
  return result
}

async function pullOnly(bus: DriveBus, device: Device): Promise<{ pulled: number; failed: number; conflicts: number }> {
  await bus.installInto(device)
  const result = await device.page.evaluate(async () => {
    const m = await import('/src/lib/syncEngine.ts')
    return m.pullFromDrive('dev_token', 'tannerville')
  })
  await bus.harvestFrom(device)
  return result
}

/** Pull-then-push, the same shape as a regular full sync but bypassing the
 *  app-layer single-flight guard (which would no-op our test's calls if a
 *  startup sync were still in flight). */
async function fullSync(bus: DriveBus, device: Device): Promise<void> {
  await pullOnly(bus, device)
  await pushOnly(bus, device)
}

// ───────────────────────────────────────────────────────────────────────────
// Local index ops — write through the real `localIndex.upsert` so vclock
// auto-bumping mirrors what production code does.
// ───────────────────────────────────────────────────────────────────────────

interface SeedRecord {
  id: string
  type: string
  categoryId?: string
  propertyId: string
  title: string
  data: Record<string, unknown>
  syncState?: 'pending_upload' | 'synced' | 'local_only' | 'conflict' | 'deleted'
}

async function localUpsert(device: Device, record: SeedRecord): Promise<void> {
  await device.page.evaluate(async (r) => {
    const m = await import('/src/lib/localIndex.ts')
    // Mirror production screens (e.g. EquipmentDetailScreen): spread the
    // prior record first so downstream sync metadata (driveFileId, driveEtag)
    // survives the edit. Without this, every test edit looks like a fresh
    // first-time write and pull treats the record as new (skipping the
    // vclock merge).
    const prior = m.localIndex.getById(r.id)
    m.localIndex.upsert({
      ...(prior ?? {}),
      syncState: 'pending_upload',
      ...r,
    } as unknown as Parameters<typeof m.localIndex.upsert>[0])
  }, record)
}

async function localDelete(device: Device, id: string): Promise<void> {
  await device.page.evaluate(async (id) => {
    const m = await import('/src/lib/localIndex.ts')
    m.localIndex.softDelete(id)
  }, id)
}

interface IndexSnapshot {
  syncState?:      string
  vclock?:         Record<string, number>
  data?:           Record<string, unknown>
  conflictFields?: Array<{ path: string; local: unknown; remote: unknown; remoteDeviceId?: string }>
  conflictReason?: string
  deletedAt?:      string
  driveFileId?:    string
  driveEtag?:      string
}

async function getRecord(device: Device, id: string): Promise<IndexSnapshot | null> {
  return device.page.evaluate((id) => {
    const idx = JSON.parse(localStorage.getItem('pm_index_v1') || '{}') as Record<string, unknown>
    return (idx[id] as IndexSnapshot | undefined) ?? null
  }, id) as Promise<IndexSnapshot | null>
}

// ───────────────────────────────────────────────────────────────────────────
// Test fixture
// ───────────────────────────────────────────────────────────────────────────

let deviceA: Device
let deviceB: Device
let bus:     DriveBus

test.beforeEach(async ({ browser }) => {
  deviceA = await makeDevice(browser, 'A', 'device-A')
  deviceB = await makeDevice(browser, 'B', 'device-B')
  bus     = new DriveBus()
})

test.afterEach(async () => {
  await deviceA?.context.close()
  await deviceB?.context.close()
})

// Helper: build a vendor record (vendor's Zod schema is the simplest of the
// registered types — id + name + propertyIds[]).
function vendorRecord(id: string, name: string, extra: Record<string, unknown> = {}): SeedRecord {
  return {
    id,
    type: 'vendor',
    propertyId: PROP_ID,
    title: name,
    data: {
      id,
      name,
      propertyIds: [PROP_ID],
      filename:    `vendor_${id}.json`,
      rootFolderId: ROOT_FOLDER,
      categoryId:  'vendor',
      ...extra,
    },
    syncState: 'pending_upload',
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Scenario 1 — Clean round-trip
// ───────────────────────────────────────────────────────────────────────────

test('scenario 1: clean round-trip — A creates, B pulls', async () => {
  await localUpsert(deviceA, vendorRecord('rt-1', 'Round-Trip Vendor', { phone: '555-RT1' }))

  const aPush = await pushOnly(bus, deviceA)
  expect(aPush.uploaded, 'A pushes 1 record').toBe(1)
  expect(aPush.failed).toBe(0)

  // Drive now has one vendor file.
  const filesAfterPush = bus.parsedFiles()
  expect(filesAfterPush.length, 'one file on shared drive').toBe(1)
  expect(filesAfterPush[0].name).toBe('vendor_rt-1.json')

  // B pulls.
  const bPull = await pullOnly(bus, deviceB)
  expect(bPull.pulled, 'B pulls 1 new record').toBe(1)
  expect(bPull.conflicts, 'no conflicts on first pull').toBe(0)

  const onB = await getRecord(deviceB, 'rt-1')
  expect(onB, 'record landed on device B').not.toBeNull()
  expect(onB!.syncState).toBe('synced')
  expect((onB!.data as { name: string }).name).toBe('Round-Trip Vendor')
  expect((onB!.data as { phone: string }).phone).toBe('555-RT1')
  // B's vclock reflects the author (A) only — B hasn't written yet.
  expect(onB!.vclock).toEqual({ 'device-A': 1 })
})

// ───────────────────────────────────────────────────────────────────────────
// Scenario 2 — Concurrent edits to DIFFERENT fields
// ───────────────────────────────────────────────────────────────────────────

test('scenario 2: concurrent edits to disjoint fields surface as conflict (whole-record by design)', async () => {
  // Initial: A creates, both sync, both have the same baseline.
  // VendorZ.email has a format validator (z.string().email()), so the
  // fixture uses RFC-compliant addresses to keep the test focused on CRDT
  // behaviour rather than schema validation.
  await localUpsert(deviceA, vendorRecord('co-1', 'Co Vendor', { phone: '555-INITIAL', email: 'init@example.com' }))
  await pushOnly(bus, deviceA)
  await pullOnly(bus, deviceB)

  const baseA = await getRecord(deviceA, 'co-1')
  const baseB = await getRecord(deviceB, 'co-1')
  expect(baseA!.syncState).toBe('synced')
  expect(baseB!.syncState).toBe('synced')
  expect(baseA!.vclock).toEqual({ 'device-A': 1 })
  expect(baseB!.vclock).toEqual({ 'device-A': 1 })  // remote-sourced upsert preserves clock

  // Concurrent local edits — A updates phone, B updates email.
  await localUpsert(deviceA, {
    ...vendorRecord('co-1', 'Co Vendor', { phone: '555-A-EDIT', email: 'init@example.com' }),
    syncState: 'pending_upload',
  })
  await localUpsert(deviceB, {
    ...vendorRecord('co-1', 'Co Vendor', { phone: '555-INITIAL', email: 'b-edit@example.com' }),
    syncState: 'pending_upload',
  })

  const afterEditA = await getRecord(deviceA, 'co-1')
  const afterEditB = await getRecord(deviceB, 'co-1')
  expect(afterEditA!.vclock?.['device-A']).toBe(2)
  expect(afterEditB!.vclock?.['device-B']).toBe(1)
  expect(afterEditB!.vclock?.['device-A']).toBe(1)

  // A pushes first — drive moves to A's view. No 412 yet (B hasn't pushed).
  await pushOnly(bus, deviceA)

  // B pulls — vclocks are concurrent (A:2,B:0) vs (A:1,B:1). Neither
  // dominates → conflict surfaced on B with field-level diff.
  const bPull = await pullOnly(bus, deviceB)
  expect(bPull.conflicts, 'B sees one concurrent conflict').toBe(1)

  const conflictedOnB = await getRecord(deviceB, 'co-1')
  expect(conflictedOnB!.syncState).toBe('conflict')
  expect(conflictedOnB!.conflictFields, 'conflictFields populated').toBeTruthy()
  const fields = conflictedOnB!.conflictFields!.map(f => f.path).sort()
  // Both `phone` (changed by A) and `email` (changed by B) show up — confirms
  // the design Pete asked about: BOTH disjoint edits surface in the diff.
  expect(fields).toContain('phone')
  expect(fields).toContain('email')

  // Local data on B was preserved (so user doesn't lose in-flight edits).
  expect((conflictedOnB!.data as { email: string }).email).toBe('b-edit@example.com')
  // Vclock OR'd.
  expect(conflictedOnB!.vclock).toEqual({ 'device-A': 2, 'device-B': 1 })

  // User on B picks "Theirs" for phone (accept A's value) and "Mine" for
  // email (keep B's value) — exercising the field-level resolver helpers.
  await deviceB.page.evaluate(async () => {
    const v = await import('/src/vault/index.ts')
    const li = await import('/src/lib/localIndex.ts')
    const r = li.localIndex.getById('co-1')!
    let next = v.resolveConflictField(r as never, 'phone', 'theirs')
    next = v.resolveConflictField(next, 'email', 'mine')
    li.localIndex.upsert(next as never)
  })

  const resolvedOnB = await getRecord(deviceB, 'co-1')
  expect(resolvedOnB!.syncState).toBe('pending_upload')
  expect((resolvedOnB!.data as { phone: string }).phone).toBe('555-A-EDIT')
  expect((resolvedOnB!.data as { email: string }).email).toBe('b-edit@example.com')
  expect(resolvedOnB!.conflictFields).toBeUndefined()

  // B pushes the merged record. A pulls. Both sides converge.
  await pushOnly(bus, deviceB)
  await pullOnly(bus, deviceA)

  const finalA = await getRecord(deviceA, 'co-1')
  const finalB = await getRecord(deviceB, 'co-1')
  expect((finalA!.data as { phone: string }).phone).toBe('555-A-EDIT')
  expect((finalA!.data as { email: string }).email).toBe('b-edit@example.com')
  expect(finalA!.syncState).toBe('synced')
  expect(finalB!.syncState).toBe('synced')
  // Both see the merged vclock with B's resolution write on top.
  expect(finalA!.vclock?.['device-A']).toBe(2)
  expect(finalA!.vclock?.['device-B']).toBeGreaterThanOrEqual(2)
  expect(finalB!.vclock).toEqual(finalA!.vclock)
})

// ───────────────────────────────────────────────────────────────────────────
// Scenario 3 — True conflict on the SAME field
// ───────────────────────────────────────────────────────────────────────────

test('scenario 3: same-field concurrent edits → conflict state with both values in conflictFields', async () => {
  await localUpsert(deviceA, vendorRecord('sf-1', 'SameField Vendor', { phone: '555-INIT' }))
  await pushOnly(bus, deviceA)
  await pullOnly(bus, deviceB)

  // Both edit phone to different values.
  await localUpsert(deviceA, vendorRecord('sf-1', 'SameField Vendor', { phone: '555-A' }))
  await localUpsert(deviceB, vendorRecord('sf-1', 'SameField Vendor', { phone: '555-B' }))

  // A pushes first.
  await pushOnly(bus, deviceA)

  // B pushes too — should hit ETag conflict, then vclock-merge into a
  // conflict state with the field-level diff.
  await pushOnly(bus, deviceB)

  const conflictedOnB = await getRecord(deviceB, 'sf-1')
  expect(conflictedOnB!.syncState).toBe('conflict')
  expect(conflictedOnB!.conflictFields).toBeTruthy()
  const phoneField = conflictedOnB!.conflictFields!.find(f => f.path === 'phone')
  expect(phoneField, 'phone is in the conflict diff').toBeTruthy()
  expect(phoneField!.local).toBe('555-B')
  expect(phoneField!.remote).toBe('555-A')

  // No `_v2_<ts>.json` sibling files — the CRDT engine resolves in-place.
  const v2Files = bus.parsedFiles().filter(f => /_v2_\d+\.json$/.test(f.name))
  expect(v2Files.length, 'no legacy v2 sibling files').toBe(0)
})

// ───────────────────────────────────────────────────────────────────────────
// Scenario 4 — Tombstone propagation
// ───────────────────────────────────────────────────────────────────────────

test('scenario 4: A deletes, B pulls → B does not resurrect, picks up the tombstone', async () => {
  await localUpsert(deviceA, vendorRecord('tomb-1', 'Will Be Deleted'))
  await pushOnly(bus, deviceA)
  await pullOnly(bus, deviceB)

  // Both have the live record.
  expect((await getRecord(deviceA, 'tomb-1'))!.syncState).toBe('synced')
  expect((await getRecord(deviceB, 'tomb-1'))!.syncState).toBe('synced')

  // A deletes locally then pushes the tombstone.
  await localDelete(deviceA, 'tomb-1')
  const aDeletedRec = await getRecord(deviceA, 'tomb-1')
  expect(aDeletedRec!.syncState).toBe('deleted')
  expect(aDeletedRec!.deletedAt).toBeTruthy()

  await pushOnly(bus, deviceA)

  // B pulls the tombstone — vclock dominates (A bumped on delete), local
  // record gets converted to a tombstone too. NOT resurrected.
  const bPull = await pullOnly(bus, deviceB)
  expect(bPull.pulled, 'tombstones do not increment the live-pulled counter').toBe(0)

  const tombOnB = await getRecord(deviceB, 'tomb-1')
  expect(tombOnB!.syncState).toBe('deleted')
  expect(tombOnB!.deletedAt).toBeTruthy()

  // Listing the property's records hides tombstones.
  const visibleOnB = await deviceB.page.evaluate(() => {
    const idx = JSON.parse(localStorage.getItem('pm_index_v1') || '{}') as Record<string, { type: string; propertyId: string; deletedAt?: string }>
    return Object.values(idx).filter(r => r.type === 'vendor' && r.propertyId === 'tannerville' && !r.deletedAt).length
  })
  expect(visibleOnB, 'tombstone hidden from list views').toBe(0)
})

// ───────────────────────────────────────────────────────────────────────────
// Scenario 5 — Concurrent CREATES (different ids, same logical content)
// ───────────────────────────────────────────────────────────────────────────

test('scenario 5: independent creates with distinct ids — both records survive', async () => {
  // Both devices create their own record without seeing each other.
  await localUpsert(deviceA, vendorRecord('cc-A', 'Created on A', { phone: '555-A-NEW' }))
  await localUpsert(deviceB, vendorRecord('cc-B', 'Created on B', { phone: '555-B-NEW' }))

  // A pushes, then B pushes.
  await pushOnly(bus, deviceA)
  await pushOnly(bus, deviceB)

  // Drive should have BOTH records.
  const filenames = bus.parsedFiles().map(f => f.name).sort()
  expect(filenames).toEqual(['vendor_cc-A.json', 'vendor_cc-B.json'])

  // Cross-pull: each device picks up the other's record.
  await pullOnly(bus, deviceA)
  await pullOnly(bus, deviceB)

  const aHasB = await getRecord(deviceA, 'cc-B')
  const bHasA = await getRecord(deviceB, 'cc-A')
  expect(aHasB!.syncState).toBe('synced')
  expect(bHasA!.syncState).toBe('synced')
  expect((aHasB!.data as { phone: string }).phone).toBe('555-B-NEW')
  expect((bHasA!.data as { phone: string }).phone).toBe('555-A-NEW')
})

// ───────────────────────────────────────────────────────────────────────────
// Scenario 6 — Stress: 10 sequential rapid writes from one device
// ───────────────────────────────────────────────────────────────────────────

test('scenario 6: 10 sequential rapid writes — vclock advances monotonically, last write wins on Drive', async () => {
  // Initial create + push.
  await localUpsert(deviceA, vendorRecord('stress-1', 'Counter Vendor', { count: 0 }))
  await pushOnly(bus, deviceA)
  expect((await getRecord(deviceA, 'stress-1'))!.vclock).toEqual({ 'device-A': 1 })

  // Ten more in-place upserts on A, pushing after each so Drive sees every
  // increment (we want to verify vclock monotonicity across rounds, not
  // just batch-then-push).
  for (let i = 1; i <= 10; i++) {
    await localUpsert(deviceA, vendorRecord('stress-1', 'Counter Vendor', { count: i }))
    await pushOnly(bus, deviceA)
    const local = await getRecord(deviceA, 'stress-1')
    // Each write bumps device-A's counter by exactly 1 (no skips, no rewinds).
    expect(local!.vclock?.['device-A'], `after write ${i} the vclock counter is ${i + 1}`).toBe(i + 1)
  }

  // After the storm: drive holds the last write only (no intermediate
  // residue), local + drive are both synced.
  const final = await getRecord(deviceA, 'stress-1')
  expect(final!.syncState).toBe('synced')
  expect((final!.data as { count: number }).count).toBe(10)
  expect(final!.vclock).toEqual({ 'device-A': 11 })

  // B pulls once at the end — sees the final state directly, no intermediate
  // versions accumulate as separate records.
  await pullOnly(bus, deviceB)
  const onB = await getRecord(deviceB, 'stress-1')
  expect((onB!.data as { count: number }).count).toBe(10)
  expect(onB!.vclock).toEqual({ 'device-A': 11 })

  // Drive has exactly one file for this record (no v2 siblings).
  const stressFiles = bus.parsedFiles().filter(f => f.name.startsWith('vendor_stress-1'))
  expect(stressFiles.length, 'only one file per record on drive').toBe(1)
})
